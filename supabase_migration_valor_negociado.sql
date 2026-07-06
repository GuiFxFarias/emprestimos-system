-- ================================================================
-- MIGRAÇÃO: valor negociado manual
--
-- Adiciona um campo opcional valor_negociado. Quando um empréstimo está
-- 'negociado' e esse campo é preenchido, ele SUBSTITUI o valor_total_devido
-- calculado (permite registrar descontos/acordos que não seguem a fórmula
-- de juros, ex: "devia R$2.100, cliente vai pagar R$1.800").
--
-- Se valor_negociado estiver vazio, o comportamento continua o mesmo de
-- antes (congelado na data_negociacao, ou calculado normalmente).
-- ================================================================

ALTER TABLE public.emprestimos
  ADD COLUMN IF NOT EXISTS valor_negociado numeric(14,2);

DROP VIEW IF EXISTS public.emprestimos_calculados;

CREATE VIEW public.emprestimos_calculados
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.owner_id,
  e.cliente_id,
  c.nome                                      AS cliente_nome,
  c.telefone                                  AS cliente_telefone,
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
  e.observacoes,
  e.created_at,

  round(e.valor_principal * (e.taxa_juros / 100.0), 2)                        AS valor_juros,
  round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)                    AS valor_no_vencimento,

  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN ref.data_ref > e.data_vencimento THEN (ref.data_ref - e.data_vencimento)
    ELSE 0
  END                                                                          AS dias_atraso,

  CASE
    WHEN e.status = 'quitado' OR ref.data_ref <= e.data_vencimento THEN 0
    ELSE ceil((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)::int
  END                                                                          AS periodos_atraso,

  0::numeric(10,2)                                                            AS valor_multa,

  CASE
    WHEN e.status <> 'quitado' AND ref.data_ref > e.data_vencimento
      THEN round(e.juros_mora_diario_reais * ((ref.data_ref - e.data_vencimento) % e.prazo_dias), 2)
    ELSE 0
  END                                                                          AS valor_mora,

  CASE
    WHEN e.status = 'quitado'   THEN 'quitado'
    WHEN e.status = 'negociado' THEN 'negociado'
    WHEN current_date > e.data_vencimento THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                          AS situacao,

  -- valor_negociado manual tem prioridade sobre o cálculo, quando presente
  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN e.status = 'negociado' AND e.valor_negociado IS NOT NULL THEN e.valor_negociado
    WHEN ref.data_ref <= e.data_vencimento THEN
      round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
    ELSE
      round(
        e.valor_principal * (1 + e.taxa_juros / 100.0)
        + e.valor_principal * (e.taxa_juros / 100.0)
          * ceil((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)
        + e.juros_mora_diario_reais
          * ((ref.data_ref - e.data_vencimento) % e.prazo_dias)
      , 2)
  END                                                                          AS valor_total_devido

FROM public.emprestimos e
JOIN public.clientes c ON c.id = e.cliente_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN e.status = 'negociado' AND e.data_negociacao IS NOT NULL THEN e.data_negociacao
    ELSE current_date
  END AS data_ref
) ref;

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
