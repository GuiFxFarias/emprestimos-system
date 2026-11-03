import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { EmprestimoStatus, PagamentoDestino } from '@/lib/types'

// Parcelas de um acordo negociado com valor manual (valor_negociado ×
// parcelas_negociado). As parcelas não existem como registros: a parcela
// "atual" é deduzida de quanto já foi pago como 'quitacao' do acordo, e o
// vencimento dela é data_primeira_parcela + N meses (mesmo dia todo mês).

type EmprestimoBase = {
  status: EmprestimoStatus
  valor_negociado: number | null
  parcelas_negociado: number | null
  data_primeira_parcela: string | null
}
type PagamentoBase = { valor: number; destino: PagamentoDestino | null }

export type SituacaoParcela = 'atrasada' | 'vence_hoje' | 'vence_em_breve' | 'em_dia'

export interface ParcelaAtual {
  numero: number        // 1-based
  total: number         // quantidade de parcelas do acordo
  valor: number         // quanto falta pagar desta parcela
}

export interface ProximaParcela extends ParcelaAtual {
  data: string          // yyyy-MM-dd
  dias: number          // dias até vencer (negativo = atrasada)
  situacao: SituacaoParcela
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function parcelaAtualNegociado(emp: EmprestimoBase, pagamentos: PagamentoBase[]): ParcelaAtual | null {
  if (emp.status !== 'negociado' || emp.valor_negociado == null || emp.valor_negociado <= 0) return null
  const total = emp.parcelas_negociado ?? 1
  const totalAcordo = emp.valor_negociado * total
  const pago = pagamentos.filter(p => p.destino === 'quitacao').reduce((s, p) => s + p.valor, 0)
  const parcelasPagas = Math.floor((pago + 0.005) / emp.valor_negociado)
  if (parcelasPagas >= total || pago >= totalAcordo - 0.005) return null
  return {
    numero: parcelasPagas + 1,
    total,
    valor: round2(Math.min(emp.valor_negociado * (parcelasPagas + 1), totalAcordo) - pago),
  }
}

export function proximaParcelaNegociado(
  emp: EmprestimoBase,
  pagamentos: PagamentoBase[],
  hoje: string,
): ProximaParcela | null {
  if (!emp.data_primeira_parcela) return null
  const atual = parcelaAtualNegociado(emp, pagamentos)
  if (!atual) return null
  const data = format(addMonths(parseISO(emp.data_primeira_parcela), atual.numero - 1), 'yyyy-MM-dd')
  const dias = differenceInCalendarDays(parseISO(data), parseISO(hoje))
  const situacao: SituacaoParcela = dias < 0
    ? 'atrasada'
    : dias === 0
    ? 'vence_hoje'
    : dias <= 7
    ? 'vence_em_breve'
    : 'em_dia'
  return { ...atual, data, dias, situacao }
}

// parcela vencida ou vencendo hoje: é o que deixa a data em vermelho
export function parcelaUrgente(p: ProximaParcela | null): boolean {
  return p?.situacao === 'atrasada' || p?.situacao === 'vence_hoje'
}
