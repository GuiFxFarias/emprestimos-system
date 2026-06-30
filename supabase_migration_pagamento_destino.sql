-- ================================================================
-- MIGRAÇÃO: Adiciona coluna 'destino' na tabela pagamentos
-- Identifica o que está sendo pago: atraso, juros, principal ou quitacao total.
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS destino text
  CHECK (destino IN ('atraso', 'juros', 'principal', 'quitacao'));

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
