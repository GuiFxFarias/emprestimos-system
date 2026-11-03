-- ================================================================
-- MIGRAÇÃO: data de vencimento das parcelas do acordo negociado
--
-- Até aqui o acordo negociado (valor_negociado × parcelas_negociado) não
-- tinha data nenhuma — então o sistema nunca avisava quando chegava o dia
-- de o cliente pagar a parcela.
--
-- Adiciona data_primeira_parcela (opcional). As parcelas seguintes vencem
-- todo mês no mesmo dia (ex: 1ª em 30/10 → 30/11, 30/12...). A parcela em
-- aberto é deduzida do quanto já foi pago no acordo, e quando o dia dela
-- chega (ou passa) o empréstimo fica em vermelho / aparece no dashboard.
--
-- A view é recriada só pra expor a nova coluna — o resto do cálculo é o
-- mesmo de supabase_migration_dias_atraso_por_periodo.sql.
--
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

ALTER TABLE public.emprestimos
  ADD COLUMN IF NOT EXISTS data_primeira_parcela date;

DROP VIEW IF EXISTS public.emprestimos_calculados;

create view public.emprestimos_calculados
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
  e.data_primeira_parcela,
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

  -- Dias de atraso do período ATUAL (reseta a cada prazo_dias vencido —
  -- mesma lógica já usada pela mora em R$ logo abaixo). Sem o módulo, um
  -- empréstimo vencido há vários meses acumulava todos os dias desde o
  -- primeiro vencimento (ex: "33 dias de atraso" em vez de "3 dias" no
  -- vencimento mensal mais próximo).
  case
    when e.status = 'quitado' or e.retroativo then 0
    when ref.data_ref > e.data_vencimento then (ref.data_ref - e.data_vencimento) % e.prazo_dias
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

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
