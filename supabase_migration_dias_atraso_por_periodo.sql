-- ================================================================
-- MIGRAÇÃO: dias_atraso reseta a cada período vencido (bug: acumulava
-- desde o primeiro vencimento)
--
-- Problema: "dias_atraso" era a diferença bruta entre hoje e a PRIMEIRA
-- data de vencimento (fixa), sem nunca resetar. Um empréstimo pego em
-- 01/02 com vencimento mensal 02/03, se hoje já passou o vencimento de
-- 02/04, mostrava algo como "33 dias de atraso" em vez de "1 dia" desde
-- o vencimento do período atual (02/04).
--
-- A mora em R$ (valor_mora) já calculava certo, usando
-- "(data_ref - data_vencimento) % prazo_dias" — só o campo dias_atraso,
-- que é o que aparece na tela ("Atrasado Xd"), usava o valor bruto.
--
-- Correção: dias_atraso passa a usar o mesmo módulo por prazo_dias que
-- a mora já usa, ficando os dois consistentes.
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

  -- Juros do período original (fixo, para referência) — 0 se retroativo
  CASE WHEN e.retroativo THEN 0
       ELSE round(e.valor_principal * (e.taxa_juros / 100.0), 2)
  END                                                                        AS valor_juros,

  -- Valor no vencimento original (sem atraso) — só o principal se retroativo
  CASE WHEN e.retroativo THEN e.valor_principal
       ELSE round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
  END                                                                        AS valor_no_vencimento,

  -- Dias de atraso do período ATUAL (reseta a cada prazo_dias vencido —
  -- mesma lógica já usada pela mora em R$ abaixo)
  CASE
    WHEN e.status = 'quitado' OR e.retroativo THEN 0
    WHEN ref.data_ref > e.data_vencimento THEN (ref.data_ref - e.data_vencimento) % e.prazo_dias
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

  -- atrasado só quando o vencimento EFETIVO (que avança a cada período de
  -- juros pago) já passou — não o vencimento original fixo. Assim, pagar
  -- o juros do período (e a mora do dia) tira o cliente do atraso, e a
  -- mora não volta a contar sozinha no dia seguinte.
  CASE
    WHEN e.status = 'quitado'   THEN 'quitado'
    WHEN e.status = 'negociado' THEN 'negociado'
    WHEN e.retroativo THEN 'em_dia'
    WHEN current_date > vef.vencimento_efetivo THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                        AS situacao,

  -- Valor total devido: juros simples recorrentes a cada período vencido
  -- + mora diária do período atual (incompleto), calculado sobre data_ref
  -- retroativo (só principal) e valor_negociado manual têm prioridade.
  -- valor_negociado é o valor POR PARCELA — total = valor_negociado ×
  -- parcelas_negociado (sem parcelas_negociado = 1x, valor cheio)
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
