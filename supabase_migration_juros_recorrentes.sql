-- ================================================================
-- MIGRAÇÃO: juros recorrentes por período após vencimento
-- A cada novo período (prazo_dias) sem pagamento, acrescenta-se
-- o mesmo valor fixo de juros do período original (juros simples
-- recorrentes). Mora diária aplica-se aos dias do período atual.
--
-- Exemplo (taxa=30%, prazo=30d):
--   vencimento:    R$ 1.300
--   +30 dias late: R$ 1.600
--   +60 dias late: R$ 1.900
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
  e.observacoes,
  e.created_at,

  -- Juros do período original (fixo, para referência)
  round(e.valor_principal * (e.taxa_juros / 100.0), 2)               AS valor_juros,

  -- Valor no vencimento original (sem atraso)
  round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)           AS valor_no_vencimento,

  -- Total de dias em atraso
  CASE
    WHEN e.status = 'quitado'             THEN 0
    WHEN current_date > e.data_vencimento THEN (current_date - e.data_vencimento)
    ELSE 0
  END                                                                  AS dias_atraso,

  -- Períodos de atraso (ceil: sobe no DIA 1 de atraso, não depois de 30 dias)
  -- Ex.: 1 dia late → 1 período; 30 dias late → 1 período; 31 dias late → 2 períodos
  CASE
    WHEN e.status = 'quitado' OR current_date <= e.data_vencimento THEN 0
    ELSE ceil((current_date - e.data_vencimento)::numeric / e.prazo_dias)::int
  END                                                                  AS periodos_atraso,

  -- Multa removida — mantida zerada para compatibilidade
  0::numeric(10,2)                                                     AS valor_multa,

  -- Mora diária: aplica-se apenas nos dias do período atual (incompleto)
  -- dias_no_periodo_atual = dias_atraso % prazo_dias
  CASE
    WHEN e.status <> 'quitado' AND current_date > e.data_vencimento
      THEN round(
        e.juros_mora_diario_reais
        * ((current_date - e.data_vencimento) % e.prazo_dias)
      , 2)
    ELSE 0
  END                                                                  AS valor_mora,

  -- Situação
  CASE
    WHEN e.status = 'quitado'             THEN 'quitado'
    WHEN current_date > e.data_vencimento THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                  AS situacao,

  -- Valor total devido hoje
  --   Sem atraso  → valor_no_vencimento
  --   Com atraso  → valor_no_vencimento + valor_juros × períodos_completos
  --                 + mora_diária × dias_no_período_atual
  --
  --   Exemplo (taxa=30%, prazo=30d, mora=0):
  --     vencimento:    1.300  (1.000 + 300)
  --     +30 dias late: 1.600  (1.300 + 300)
  --     +60 dias late: 1.900  (1.600 + 300)
  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN current_date <= e.data_vencimento THEN
      round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
    ELSE
      round(
        e.valor_principal * (1 + e.taxa_juros / 100.0)
        + e.valor_principal * (e.taxa_juros / 100.0)
          * ceil((current_date - e.data_vencimento)::numeric / e.prazo_dias)
        + e.juros_mora_diario_reais
          * ((current_date - e.data_vencimento) % e.prazo_dias)
      , 2)
  END                                                                  AS valor_total_devido

FROM public.emprestimos e
JOIN public.clientes c ON c.id = e.cliente_id;

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
