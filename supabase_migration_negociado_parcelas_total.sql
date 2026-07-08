-- ================================================================
-- MIGRAÇÃO: valor_negociado agora é o valor DA PARCELA, não do total
--
-- Até aqui, quando um empréstimo era negociado com valor_negociado
-- preenchido, o valor_total_devido virava exatamente valor_negociado —
-- e parcelas_negociado era só informativo. Só que na prática o valor
-- negociado é combinado por parcela (ex: "R$2.500 em 3x"), então o
-- total devido tem que ser valor_negociado × parcelas_negociado
-- (R$7.500), não só R$2.500.
--
-- Esta migração inclui também a correção do "atrasado por pagamento"
-- (vencimento efetivo que avança conforme os juros são pagos) — se você
-- já rodou supabase_migration_atraso_por_pagamento.sql antes, pode
-- rodar esta tranquilamente por cima (ela recria a view do zero).
--
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

DROP VIEW IF EXISTS public.emprestimos_calculados;

CREATE VIEW public.emprestimos_calculados
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
  e.data_negociacao,
  e.valor_negociado,
  e.parcelas_negociado,
  e.retroativo,
  e.observacoes,
  e.created_at,

  CASE WHEN e.retroativo THEN 0
       ELSE round(e.valor_principal * (e.taxa_juros / 100.0), 2)
  END                                                                        AS valor_juros,

  CASE WHEN e.retroativo THEN e.valor_principal
       ELSE round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
  END                                                                        AS valor_no_vencimento,

  CASE
    WHEN e.status = 'quitado' OR e.retroativo THEN 0
    WHEN ref.data_ref > e.data_vencimento THEN (ref.data_ref - e.data_vencimento)
    ELSE 0
  END                                                                        AS dias_atraso,

  CASE
    WHEN e.status = 'quitado' OR e.retroativo OR ref.data_ref <= e.data_vencimento THEN 0
    ELSE floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)::int
  END                                                                        AS periodos_atraso,

  0::numeric(10,2)                                                           AS valor_multa,

  CASE
    WHEN e.status <> 'quitado' AND NOT e.retroativo AND ref.data_ref > e.data_vencimento
      THEN round(e.juros_mora_diario_reais * ((ref.data_ref - e.data_vencimento) % e.prazo_dias), 2)
    ELSE 0
  END                                                                        AS valor_mora,

  -- atrasado só quando o vencimento EFETIVO (que avança a cada período de
  -- juros pago) já passou — não o vencimento original fixo
  CASE
    WHEN e.status = 'quitado'   THEN 'quitado'
    WHEN e.status = 'negociado' THEN 'negociado'
    WHEN e.retroativo THEN 'em_dia'
    WHEN current_date > vef.vencimento_efetivo THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                        AS situacao,

  -- valor_negociado é o valor POR PARCELA — o total é valor_negociado ×
  -- parcelas_negociado (parcelas_negociado ausente = 1x, valor cheio)
  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN e.retroativo THEN e.valor_principal
    WHEN e.status = 'negociado' AND e.valor_negociado IS NOT NULL
      THEN round(e.valor_negociado * coalesce(e.parcelas_negociado, 1), 2)
    WHEN ref.data_ref <= e.data_vencimento THEN
      round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
    ELSE
      round(
        e.valor_principal * (1 + e.taxa_juros / 100.0)
        + e.valor_principal * (e.taxa_juros / 100.0)
          * floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)
        + e.juros_mora_diario_reais
          * ((ref.data_ref - e.data_vencimento) % e.prazo_dias)
      , 2)
  END                                                                        AS valor_total_devido
FROM public.emprestimos e
JOIN public.clientes c ON c.id = e.cliente_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN e.status = 'negociado' AND e.data_negociacao IS NOT NULL THEN e.data_negociacao
    ELSE current_date
  END AS data_ref
) ref
CROSS JOIN LATERAL (
  SELECT coalesce(sum(p.valor), 0) AS pago_juros_total
  FROM public.pagamentos p
  WHERE p.emprestimo_id = e.id AND p.destino = 'juros'
) pj
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN round(e.valor_principal * (e.taxa_juros / 100.0), 2) > 0
      THEN e.data_vencimento
        + (floor(pj.pago_juros_total / round(e.valor_principal * (e.taxa_juros / 100.0), 2))::int * e.prazo_dias)
    ELSE e.data_vencimento
  END AS vencimento_efetivo
) vef;

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
