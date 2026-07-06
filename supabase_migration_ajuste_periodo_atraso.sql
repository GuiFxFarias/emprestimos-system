-- ================================================================
-- MIGRAÇÃO: ajuste do período de atraso (ceil → floor)
--
-- Antes: no dia 1 de atraso já era cobrado um período INTEIRO extra
-- de juros (ceil), mesmo faltando quase 30 dias pra completar o
-- próximo ciclo. Só a mora diária deveria valer nesse meio-tempo.
--
-- Agora: o próximo período de juros só é somado quando um prazo_dias
-- COMPLETO de atraso se passou (floor). Até lá, só mora diária.
--
-- Exemplo (principal=1000, taxa=30%, prazo=30d):
--   vencimento (dia 0):        R$ 1.300 (juros do período)
--   1 a 29 dias de atraso:     R$ 1.300 + mora_diária × dias_atraso
--   30 dias de atraso (novo
--     período completo):       R$ 1.600 (+ 300 de juros) + mora do dia 0 do novo período
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
  e.retroativo,
  e.observacoes,
  e.created_at,

  -- Juros do período original (fixo, para referência) — 0 se retroativo
  CASE WHEN e.retroativo THEN 0
       ELSE round(e.valor_principal * (e.taxa_juros / 100.0), 2)
  END                                                                        AS valor_juros,

  -- Valor no vencimento original (sem atraso) — só o principal se retroativo
  CASE WHEN e.retroativo THEN e.valor_principal
       ELSE round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
  END                                                                        AS valor_no_vencimento,

  CASE
    WHEN e.status = 'quitado' OR e.retroativo THEN 0
    WHEN ref.data_ref > e.data_vencimento THEN (ref.data_ref - e.data_vencimento)
    ELSE 0
  END                                                                        AS dias_atraso,

  -- Períodos de atraso (floor: só soma o próximo período de juros quando um
  -- prazo_dias completo se passou — antes disso é só mora diária)
  CASE
    WHEN e.status = 'quitado' OR e.retroativo OR ref.data_ref <= e.data_vencimento THEN 0
    ELSE floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)::int
  END                                                                        AS periodos_atraso,

  -- Multa removida — mantida zerada para compatibilidade
  0::numeric(10,2)                                                           AS valor_multa,

  -- Mora diária: aplica-se apenas nos dias do período atual (incompleto)
  CASE
    WHEN e.status <> 'quitado' AND NOT e.retroativo AND ref.data_ref > e.data_vencimento
      THEN round(e.juros_mora_diario_reais * ((ref.data_ref - e.data_vencimento) % e.prazo_dias), 2)
    ELSE 0
  END                                                                        AS valor_mora,

  -- retroativo nunca é 'atrasado' — sem juros/mora não faz sentido cobrar urgência
  CASE
    WHEN e.status = 'quitado'   THEN 'quitado'
    WHEN e.status = 'negociado' THEN 'negociado'
    WHEN e.retroativo THEN 'em_dia'
    WHEN current_date > e.data_vencimento THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                        AS situacao,

  -- Valor total devido: juros simples recorrentes a cada período completo vencido
  -- + mora diária do período atual (incompleto), calculado sobre data_ref
  -- retroativo (só principal) e valor_negociado manual têm prioridade
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
) ref;

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
