-- ================================================================
-- MIGRAÇÃO: "atrasado" passa a considerar os pagamentos de juros
--
-- Problema: a "situacao" (atrasado/em_dia) era decidida só comparando
-- current_date com data_vencimento — ignorava completamente a tabela
-- pagamentos. Resultado: um cliente que já pagou os juros do período (e
-- a mora do dia) continuava marcado como "Em atraso" pra sempre, porque
-- data_vencimento nunca muda.
--
-- Correção: cada período de juros pago (soma dos pagamentos com
-- destino='juros') empurra o "vencimento efetivo" pra frente um
-- prazo_dias inteiro — é o equivalente a "renovar" o empréstimo, só que
-- calculado on-the-fly a partir dos pagamentos, sem alterar a coluna
-- data_vencimento. Só volta a ficar atrasado quando esse vencimento
-- efetivo for ultrapassado de novo.
--
-- Isso também resolve o detalhe da mora: como o período inteiro é
-- fechado ao pagar o juros (o vencimento efetivo pula prazo_dias pra
-- frente, não só até a data do pagamento), no dia seguinte não volta a
-- contar mais um dia de mora — a mora só "conta" de novo se o próximo
-- vencimento efetivo passar sem pagamento.
--
-- valor_juros, dias_atraso, periodos_atraso, valor_mora e
-- valor_total_devido continuam calculados como antes (mostram quanto
-- ainda é devido) — só a "situacao" (o selo Em atraso/Em dia) muda.
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

  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN e.retroativo THEN e.valor_principal
    WHEN e.status = 'negociado' AND e.valor_negociado IS NOT NULL THEN e.valor_negociado
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
-- soma de tudo já pago como "juros" pra esse empréstimo
CROSS JOIN LATERAL (
  SELECT coalesce(sum(p.valor), 0) AS pago_juros_total
  FROM public.pagamentos p
  WHERE p.emprestimo_id = e.id AND p.destino = 'juros'
) pj
-- vencimento efetivo: cada período de juros integralmente pago empurra
-- o vencimento um prazo_dias pra frente. Com taxa 0% não há juros pra
-- pagar/avançar período, então mantém o vencimento original.
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
