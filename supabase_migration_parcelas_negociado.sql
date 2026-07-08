-- ================================================================
-- MIGRAÇÃO: parcelas do acordo negociado
--
-- Adiciona um campo opcional parcelas_negociado (inteiro) — quantas vezes
-- foi combinado receber o valor_negociado. É só um registro informativo,
-- não gera parcelas nem cálculo automático: não afeta valor_principal
-- nem valor_total_devido.
-- ================================================================

alter table public.emprestimos
  add column if not exists parcelas_negociado integer check (parcelas_negociado is null or parcelas_negociado > 0);

drop view if exists public.emprestimos_calculados;

create or replace view public.emprestimos_calculados
with (security_invoker = on) as
select
  e.id,
  e.owner_id,
  e.cliente_id,
  c.nome                                   as cliente_nome,
  c.telefone                               as cliente_telefone,
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

  case when e.retroativo then 0
       else round(e.valor_principal * (e.taxa_juros / 100.0), 2)
  end                                                                        as valor_juros,

  case when e.retroativo then e.valor_principal
       else round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
  end                                                                        as valor_no_vencimento,

  case
    when e.status = 'quitado' or e.retroativo then 0
    when ref.data_ref > e.data_vencimento then (ref.data_ref - e.data_vencimento)
    else 0
  end                                                                        as dias_atraso,

  case
    when e.status = 'quitado' or e.retroativo or ref.data_ref <= e.data_vencimento then 0
    else floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)::int
  end                                                                        as periodos_atraso,

  0::numeric(10,2)                                                           as valor_multa,

  case
    when e.status <> 'quitado' and not e.retroativo and ref.data_ref > e.data_vencimento
      then round(e.juros_mora_diario_reais * ((ref.data_ref - e.data_vencimento) % e.prazo_dias), 2)
    else 0
  end                                                                        as valor_mora,

  case
    when e.status = 'quitado'   then 'quitado'
    when e.status = 'negociado' then 'negociado'
    when e.retroativo then 'em_dia'
    when current_date > e.data_vencimento then 'atrasado'
    else 'em_dia'
  end                                                                        as situacao,

  case
    when e.status = 'quitado' then 0
    when e.retroativo then e.valor_principal
    when e.status = 'negociado' and e.valor_negociado is not null then e.valor_negociado
    when ref.data_ref <= e.data_vencimento then
      round(e.valor_principal * (1 + e.taxa_juros / 100.0), 2)
    else
      round(
        e.valor_principal * (1 + e.taxa_juros / 100.0)
        + e.valor_principal * (e.taxa_juros / 100.0)
          * floor((ref.data_ref - e.data_vencimento)::numeric / e.prazo_dias)
        + e.juros_mora_diario_reais
          * ((ref.data_ref - e.data_vencimento) % e.prazo_dias)
      , 2)
  end                                                                        as valor_total_devido
from public.emprestimos e
join public.clientes c on c.id = e.cliente_id
cross join lateral (
  select case
    when e.status = 'negociado' and e.data_negociacao is not null then e.data_negociacao
    else current_date
  end as data_ref
) ref;

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
