-- ================================================================
-- MIGRAÇÃO: juros de mora em R$/dia (sem multa de atraso)
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

-- 0. Dropar a view (depende das colunas que vamos alterar)
DROP VIEW IF EXISTS public.emprestimos_calculados;

-- 1. Renomear coluna e ajustar tipo (emprestimos)
ALTER TABLE public.emprestimos
  RENAME COLUMN juros_mora_diario_percentual TO juros_mora_diario_reais;

ALTER TABLE public.emprestimos
  ALTER COLUMN juros_mora_diario_reais TYPE numeric(10,2);

-- 2. Dropar multa de emprestimos
ALTER TABLE public.emprestimos
  DROP COLUMN IF EXISTS multa_atraso_percentual;

-- 3. Renomear coluna e ajustar tipo (configuracoes)
ALTER TABLE public.configuracoes
  RENAME COLUMN juros_mora_diario_percentual TO juros_mora_diario_reais;

ALTER TABLE public.configuracoes
  ALTER COLUMN juros_mora_diario_reais TYPE numeric(10,2);

-- 4. Dropar multa de configuracoes
ALTER TABLE public.configuracoes
  DROP COLUMN IF EXISTS multa_atraso_percentual;

-- 5. Recriar a view com nova fórmula
--    mora = juros_mora_diario_reais * dias_atraso  (valor fixo em R$/dia)
--    multa = 0 (removida)
CREATE OR REPLACE VIEW public.emprestimos_calculados
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.owner_id,
  e.cliente_id,
  c.nome                                   AS cliente_nome,
  c.telefone                               AS cliente_telefone,
  e.valor_principal,
  e.taxa_juros,
  e.prazo_dias,
  e.data_emprestimo,
  e.data_vencimento,
  e.juros_mora_diario_reais,
  e.status,
  e.data_quitacao,
  e.valor_quitado,
  e.observacoes,
  e.created_at,

  -- Juros do período (fixo): principal * taxa%
  round(e.valor_principal * (e.taxa_juros / 100.0), 2)                        AS valor_juros,

  -- Valor no vencimento (sem atraso)
  round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)                    AS valor_no_vencimento,

  -- Dias de atraso
  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN current_date > e.data_vencimento THEN (current_date - e.data_vencimento)
    ELSE 0
  END                                                                          AS dias_atraso,

  -- Multa removida — sempre 0
  0::numeric(10,2)                                                             AS valor_multa,

  -- Mora = R$/dia * dias de atraso
  CASE
    WHEN e.status <> 'quitado' AND current_date > e.data_vencimento
      THEN round(e.juros_mora_diario_reais * (current_date - e.data_vencimento), 2)
    ELSE 0
  END                                                                          AS valor_mora,

  -- Situação
  CASE
    WHEN e.status = 'quitado' THEN 'quitado'
    WHEN current_date > e.data_vencimento THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                          AS situacao,

  -- Valor total devido hoje
  CASE
    WHEN e.status = 'quitado' THEN 0
    ELSE round(
      e.valor_principal * (1 + e.taxa_juros / 100.0)
      + CASE WHEN current_date > e.data_vencimento
          THEN e.juros_mora_diario_reais * (current_date - e.data_vencimento)
          ELSE 0
        END
    , 2)
  END                                                                          AS valor_total_devido

FROM public.emprestimos e
JOIN public.clientes c ON c.id = e.cliente_id;

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
