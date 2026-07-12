-- Migration: tabela de anotações por empréstimo
-- Referenciada em src/lib/queries.ts e src/app/(app)/emprestimos/emprestimos-view.tsx
-- mas nunca havia sido criada no banco (causa do erro "Could not find the table
-- 'public.anotacoes_emprestimo' in the schema cache").

create table if not exists public.anotacoes_emprestimo (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emprestimo_id  uuid not null references public.emprestimos(id) on delete cascade,
  texto          text not null check (char_length(trim(texto)) > 0),
  created_at     timestamptz not null default now()
);

create index if not exists idx_anotacoes_owner on public.anotacoes_emprestimo(owner_id);
create index if not exists idx_anotacoes_emp   on public.anotacoes_emprestimo(emprestimo_id);

alter table public.anotacoes_emprestimo enable row level security;

create policy "anot_select_own" on public.anotacoes_emprestimo for select using (owner_id = auth.uid());
create policy "anot_insert_own" on public.anotacoes_emprestimo for insert with check (owner_id = auth.uid());
create policy "anot_delete_own" on public.anotacoes_emprestimo for delete using (owner_id = auth.uid());
