-- =============================================================
-- GESTÃO DE EMPRÉSTIMOS – Schema completo (Supabase / PostgreSQL 15+)
-- Cole TUDO isto no SQL Editor do Supabase e rode de uma vez.
-- =============================================================

-- 1) EXTENSÕES ------------------------------------------------
create extension if not exists "uuid-ossp";

-- 2) TIPOS (ENUMS) --------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'emprestimo_status') then
    create type emprestimo_status as enum ('ativo', 'negociado', 'quitado');
  end if;
  if not exists (select 1 from pg_type where typname = 'pagamento_tipo') then
    create type pagamento_tipo as enum ('parcial', 'quitacao');
  end if;
end$$;

-- 3) TABELAS --------------------------------------------------

-- 3.1 Clientes
create table if not exists public.clientes (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  telefone    text,
  documento   text,
  endereco    text,
  observacoes text,
  foto_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.2 Configurações (UMA linha por usuário)
create table if not exists public.configuracoes (
  id                            uuid primary key default uuid_generate_v4(),
  owner_id                      uuid not null unique default auth.uid()
                                  references auth.users(id) on delete cascade,
  taxa_juros_padrao             numeric(6,3) not null default 0,
  prazo_padrao_dias             integer      not null default 30,
  juros_mora_diario_reais       numeric(10,2) not null default 0,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- 3.3 Empréstimos
create table if not exists public.emprestimos (
  id                            uuid primary key default uuid_generate_v4(),
  owner_id                      uuid not null default auth.uid()
                                  references auth.users(id) on delete cascade,
  cliente_id                    uuid not null references public.clientes(id) on delete restrict,
  valor_principal               numeric(14,2) not null check (valor_principal > 0),
  taxa_juros                    numeric(6,3)  not null default 0,
  prazo_dias                    integer       not null default 30 check (prazo_dias > 0),
  data_emprestimo               date          not null default current_date,
  data_vencimento               date          generated always as (data_emprestimo + prazo_dias) stored,
  juros_mora_diario_reais       numeric(10,2) not null default 0,
  status                        emprestimo_status not null default 'ativo',
  data_quitacao                 date,
  valor_quitado                 numeric(14,2),
  data_negociacao               date,
  valor_negociado               numeric(14,2),
  parcelas_negociado            integer check (parcelas_negociado is null or parcelas_negociado > 0),
  retroativo                    boolean not null default false,
  observacoes                   text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- 3.4 Pagamentos
create table if not exists public.pagamentos (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emprestimo_id  uuid not null references public.emprestimos(id) on delete cascade,
  valor          numeric(14,2) not null check (valor > 0),
  data_pagamento date not null default current_date,
  tipo           pagamento_tipo not null default 'quitacao',
  destino        text check (destino in ('atraso', 'juros', 'principal', 'quitacao')),
  observacoes    text,
  created_at     timestamptz not null default now()
);

-- 4) ÍNDICES --------------------------------------------------
create index if not exists idx_clientes_owner     on public.clientes(owner_id);
create index if not exists idx_emprestimos_owner   on public.emprestimos(owner_id);
create index if not exists idx_emprestimos_cliente on public.emprestimos(cliente_id);
create index if not exists idx_emprestimos_status  on public.emprestimos(status);
create index if not exists idx_pagamentos_owner    on public.pagamentos(owner_id);
create index if not exists idx_pagamentos_emp      on public.pagamentos(emprestimo_id);

-- 5) VIEW DE CÁLCULO -----------------------------------------
-- 'negociado' com data_negociacao preenchida congela juros/mora/atraso
-- naquela data (data_ref deixa de ser current_date). Sem data_negociacao,
-- os cálculos seguem normalmente — só muda o rótulo/situação.
create or replace view public.emprestimos_calculados
with (security_invoker = on) as
select
  e.id,
  e.owner_id,
  e.cliente_id,
  c.nome                                   as cliente_nome,
  c.telefone                               as cliente_telefone,
  e.valor_principal,
  e.taxa_juros,
  e.prazo_dias,
  e.data_emprestimo,
  e.data_vencimento,
  e.juros_mora_diario_reais,
  e.status,
  e.data_quitacao,
  e.valor_quitado,
  e.data_negociacao,
  e.valor_negociado,
  e.parcelas_negociado,
  e.retroativo,
  e.observacoes,
  e.created_at,

  -- Juros do período original (fixo, para referência) — 0 se retroativo
  case when e.retroativo then 0
       else round(e.valor_principal * (e.taxa_juros / 100.0), 2)
  end                                                                        as valor_juros,

  -- Valor no vencimento original (sem atraso) — só o principal se retroativo
  case when e.retroativo then e.valor_principal
       else round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
  end                                                                        as valor_no_vencimento,

  case
    when e.status = 'quitado' or e.retroativo then 0
    when ref.data_ref > e.data_vencimento then (ref.data_ref - e.data_vencimento)
    else 0
  end                                                                        as dias_atraso,

  -- Períodos de atraso (floor: só soma o próximo período de juros quando um
  -- prazo_dias completo se passou — antes disso é só mora diária)
  case
    when e.status = 'quitado' or e.retroativo or ref.data_ref <= e.data_vencimento then 0
    else floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)::int
  end                                                                        as periodos_atraso,

  -- Multa removida — mantida zerada para compatibilidade
  0::numeric(10,2)                                                           as valor_multa,

  -- Mora diária: aplica-se apenas nos dias do período atual (incompleto)
  case
    when e.status <> 'quitado' and not e.retroativo and ref.data_ref > e.data_vencimento
      then round(e.juros_mora_diario_reais * ((ref.data_ref - e.data_vencimento) % e.prazo_dias), 2)
    else 0
  end                                                                        as valor_mora,

  -- atrasado só quando o vencimento EFETIVO (que avança a cada período de
  -- juros pago) já passou — não o vencimento original fixo. Assim, pagar
  -- o juros do período (e a mora do dia) tira o cliente do atraso, e a
  -- mora não volta a contar sozinha no dia seguinte.
  case
    when e.status = 'quitado'   then 'quitado'
    when e.status = 'negociado' then 'negociado'
    when e.retroativo then 'em_dia'
    when current_date > vef.vencimento_efetivo then 'atrasado'
    else 'em_dia'
  end                                                                        as situacao,

  -- Valor total devido: juros simples recorrentes a cada período vencido
  -- + mora diária do período atual (incompleto), calculado sobre data_ref
  -- retroativo (só principal) e valor_negociado manual têm prioridade.
  -- valor_negociado é o valor POR PARCELA — total = valor_negociado ×
  -- parcelas_negociado (sem parcelas_negociado = 1x, valor cheio)
  case
    when e.status = 'quitado' then 0
    when e.retroativo then e.valor_principal
    when e.status = 'negociado' and e.valor_negociado is not null
      then round(e.valor_negociado * coalesce(e.parcelas_negociado, 1), 2)
    when ref.data_ref <= e.data_vencimento then
      round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
    else
      round(
        e.valor_principal * (1 + e.taxa_juros / 100.0)
        + e.valor_principal * (e.taxa_juros / 100.0)
          * floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)
        + e.juros_mora_diario_reais
          * ((ref.data_ref - e.data_vencimento) % e.prazo_dias)
      , 2)
  end                                                                        as valor_total_devido
from public.emprestimos e
join public.clientes c on c.id = e.cliente_id
cross join lateral (
  select case
    when e.status = 'negociado' and e.data_negociacao is not null then e.data_negociacao
    else current_date
  end as data_ref
) ref
-- soma de tudo já pago como "juros" pra esse empréstimo
cross join lateral (
  select coalesce(sum(p.valor), 0) as pago_juros_total
  from public.pagamentos p
  where p.emprestimo_id = e.id and p.destino = 'juros'
) pj
-- vencimento efetivo: cada período de juros integralmente pago empurra
-- o vencimento um prazo_dias pra frente. Com taxa 0% não há juros pra
-- pagar/avançar período, então mantém o vencimento original.
cross join lateral (
  select case
    when round(e.valor_principal * (e.taxa_juros / 100.0), 2) > 0
      then e.data_vencimento
        + (floor(pj.pago_juros_total / round(e.valor_principal * (e.taxa_juros / 100.0), 2))::int * e.prazo_dias)
    else e.data_vencimento
  end as vencimento_efetivo
) vef;

-- 6) ROW LEVEL SECURITY (RLS) --------------------------------
alter table public.clientes      enable row level security;
alter table public.configuracoes enable row level security;
alter table public.emprestimos   enable row level security;
alter table public.pagamentos    enable row level security;

create policy "clientes_select_own" on public.clientes for select using (owner_id = auth.uid());
create policy "clientes_insert_own" on public.clientes for insert with check (owner_id = auth.uid());
create policy "clientes_update_own" on public.clientes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "clientes_delete_own" on public.clientes for delete using (owner_id = auth.uid());

create policy "config_select_own" on public.configuracoes for select using (owner_id = auth.uid());
create policy "config_insert_own" on public.configuracoes for insert with check (owner_id = auth.uid());
create policy "config_update_own" on public.configuracoes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "emp_select_own" on public.emprestimos for select using (owner_id = auth.uid());
create policy "emp_insert_own" on public.emprestimos for insert with check (owner_id = auth.uid());
create policy "emp_update_own" on public.emprestimos for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "emp_delete_own" on public.emprestimos for delete using (owner_id = auth.uid());

create policy "pag_select_own" on public.pagamentos for select using (owner_id = auth.uid());
create policy "pag_insert_own" on public.pagamentos for insert with check (owner_id = auth.uid());
create policy "pag_delete_own" on public.pagamentos for delete using (owner_id = auth.uid());

-- 7) TRIGGERS -------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_clientes_updated on public.clientes;
create trigger trg_clientes_updated before update on public.clientes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_config_updated on public.configuracoes;
create trigger trg_config_updated before update on public.configuracoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_emprestimos_updated on public.emprestimos;
create trigger trg_emprestimos_updated before update on public.emprestimos
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.configuracoes (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8) STORAGE ---------------------------------------------------

-- Bucket privado para fotos de clientes
insert into storage.buckets (id, name, public)
values ('fotos-clientes', 'fotos-clientes', false)
on conflict (id) do nothing;

-- Políticas: cada usuário acessa apenas sua própria pasta (owner_id/cliente_id)
create policy "fotos_select_own" on storage.objects
  for select using (
    bucket_id = 'fotos-clientes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "fotos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'fotos-clientes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "fotos_update_own" on storage.objects
  for update using (
    bucket_id = 'fotos-clientes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "fotos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'fotos-clientes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================================
-- FIM DO SCHEMA
-- =============================================================
