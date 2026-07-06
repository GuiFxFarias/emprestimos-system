-- ================================================================
-- MIGRAÇÃO: status "negociado" (acordo de quitação entre as partes)
--
-- Adiciona um terceiro status ao empréstimo (além de ativo/quitado).
-- Campo data_negociacao é OPCIONAL:
--   - preenchido  → congela dias de atraso / juros / mora naquela data
--   - vazio       → cálculos continuam normalmente, só muda o rótulo/situação
-- Um empréstimo negociado nunca aparece como "atrasado" no dashboard/lista.
--
-- IMPORTANTE: rode o PASSO 1 sozinho e confirme antes de rodar o PASSO 2.
-- O Postgres não permite usar um valor de enum recém-criado na mesma
-- transação em que foi adicionado.
-- ================================================================

-- PASSO 1 — rode isto sozinho:
ALTER TYPE emprestimo_status ADD VALUE IF NOT EXISTS 'negociado';


-- PASSO 2 — depois de confirmar que o passo 1 rodou, execute o restante:

ALTER TABLE public.emprestimos
  ADD COLUMN IF NOT EXISTS data_negociacao date;

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
  e.observacoes,
  e.created_at,

  round(e.valor_principal * (e.taxa_juros / 100.0), 2)                        AS valor_juros,
  round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)                    AS valor_no_vencimento,

  CASE
    WHEN e.status = 'quitado' THEN 0
    WHEN ref.data_ref > e.data_vencimento THEN (ref.data_ref - e.data_vencimento)
    ELSE 0
  END                                                                          AS dias_atraso,

  -- Períodos de atraso (ceil: sobe no dia 1 de atraso, não depois de prazo_dias)
  CASE
    WHEN e.status = 'quitado' OR ref.data_ref <= e.data_vencimento THEN 0
    ELSE ceil((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)::int
  END                                                                          AS periodos_atraso,

  -- Multa removida — mantida zerada para compatibilidade
  0::numeric(10,2)                                                            AS valor_multa,

  -- Mora diária: aplica-se apenas nos dias do período atual (incompleto)
  CASE
    WHEN e.status <> 'quitado' AND ref.data_ref > e.data_vencimento
      THEN round(e.juros_mora_diario_reais * ((ref.data_ref - e.data_vencimento) % e.prazo_dias), 2)
    ELSE 0
  END                                                                          AS valor_mora,

  -- 'negociado' nunca é 'atrasado', independente de estar congelado ou não
  CASE
    WHEN e.status = 'quitado'   THEN 'quitado'
    WHEN e.status = 'negociado' THEN 'negociado'
    WHEN current_date > e.data_vencimento THEN 'atrasado'
    ELSE 'em_dia'
  END                                                                          AS situacao,

  -- Valor total devido: juros recorrentes a cada período vencido
  -- + mora diária do período atual, calculado sobre data_ref
  -- (data_ref = data_negociacao se congelado, senão current_date)
  CASE
    WHEN e.status = 'quitado' THEN 0
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
