import type { PagamentoDestino } from '@/lib/types'

// Separa o que foi recebido de um empréstimo em juros (lucro) e capital
// (o que voltou pro caixa do valor emprestado).

type PagamentoBase = { valor: number; destino: PagamentoDestino | null }
type EmprestimoBase = {
  valor_principal: number
  valor_negociado: number | null
  parcelas_negociado: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function somar(pagamentos: PagamentoBase[], filtro: (p: PagamentoBase) => boolean): number {
  return pagamentos.filter(filtro).reduce((s, p) => s + p.valor, 0)
}

// Composição de um acordo negociado com valor manual: quanto do total
// combinado é capital (o principal que ainda não tinha voltado antes da
// negociação) e quanto é juros. Acordo menor que o capital = sem juros.
export function composicaoNegociado(emp: EmprestimoBase, pagamentos: PagamentoBase[]) {
  const total = round2((emp.valor_negociado ?? 0) * (emp.parcelas_negociado ?? 1))
  const pagoPrincipal = somar(pagamentos, p => p.destino === 'principal')
  const capital = round2(Math.min(total, Math.max(0, emp.valor_principal - pagoPrincipal)))
  return { capital, juros: round2(total - capital), total }
}

// - juros / mora → juros
// - principal → capital
// - quitação (ou pagamento antigo sem destino) de empréstimo normal: o que
//   faltava do principal volta pro capital, o resto é juros
// - quitação de acordo negociado (parcelas): dividida proporcionalmente à
//   composição do acordo — ex.: 10.000 + 3.500 de juros em 3x de 4.500 →
//   cada parcela é 3.333,33 de capital + 1.166,67 de juros
export function separarRecebido(emp: EmprestimoBase, pagamentos: PagamentoBase[]) {
  const pagoPrincipal = somar(pagamentos, p => p.destino === 'principal')
  const pagoJuros = somar(pagamentos, p => p.destino === 'juros' || p.destino === 'atraso')
  const pagoQuitacao = somar(pagamentos, p => p.destino === 'quitacao' || p.destino == null)

  let capitalQuitacao: number
  if (emp.valor_negociado != null) {
    const c = composicaoNegociado(emp, pagamentos)
    capitalQuitacao = c.total > 0 ? pagoQuitacao * (c.capital / c.total) : pagoQuitacao
  } else {
    capitalQuitacao = Math.min(pagoQuitacao, Math.max(0, emp.valor_principal - pagoPrincipal))
  }

  return {
    capital: round2(pagoPrincipal + capitalQuitacao),
    juros: round2(pagoJuros + pagoQuitacao - capitalQuitacao),
  }
}
