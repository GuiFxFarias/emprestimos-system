-- ================================================================
-- MIGRAÇÃO: Tabela 'cheques' (troca de cheque)
-- 'valor' é o valor do cheque, recebido de uma vez na data_vencimento. Os
-- juros (taxa_juros % do cheque) são descontados na troca: o cliente recebe
-- valor − juros (ex.: cheque de 40.000 a 20% → entrega 32.000, lucro 8.000).
-- Juros fixos: não renova por período nem gera mora.
-- Só CRIA a tabela nova; não altera nenhum dado existente.
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.cheques (
  id                uuid primary key default uuid_generate_v4(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id        uuid not null references public.clientes(id) on delete restrict,
  valor             numeric(14,2) not null check (valor > 0),
  taxa_juros        numeric(6,3)  not null default 0 check (taxa_juros >= 0),
  data_entrada      date not null default current_date,
  data_vencimento   date not null,
  banco             text,
  numero            text,
  status            text not null default 'a_compensar'
                      check (status in ('a_compensar', 'compensado', 'devolvido')),
  data_compensacao  date,
  observacoes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_cheques_owner      ON public.cheques(owner_id);
CREATE INDEX IF NOT EXISTS idx_cheques_cliente    ON public.cheques(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cheques_vencimento ON public.cheques(data_vencimento);

ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cheq_select_own" ON public.cheques;
DROP POLICY IF EXISTS "cheq_insert_own" ON public.cheques;
DROP POLICY IF EXISTS "cheq_update_own" ON public.cheques;
DROP POLICY IF EXISTS "cheq_delete_own" ON public.cheques;
CREATE POLICY "cheq_select_own" ON public.cheques FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "cheq_insert_own" ON public.cheques FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cheq_update_own" ON public.cheques FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cheq_delete_own" ON public.cheques FOR DELETE USING (owner_id = auth.uid());

DROP TRIGGER IF EXISTS trg_cheques_updated ON public.cheques;
CREATE TRIGGER trg_cheques_updated BEFORE UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
