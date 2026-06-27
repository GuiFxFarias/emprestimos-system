export interface PreviewParams {
  valorPrincipal: number
  taxaJuros: number
  prazoDias: number
  jurosMoraDiarioReais: number
  dataEmprestimo: string
}

export interface PreviewResult {
  valorJuros: number
  valorNoVencimento: number
  dataVencimento: Date
}

export function calcularPreview(params: PreviewParams): PreviewResult {
  const { valorPrincipal, taxaJuros, prazoDias, dataEmprestimo } = params

  const valorJuros = round2(valorPrincipal * (taxaJuros / 100))
  const valorNoVencimento = round2(valorPrincipal + valorJuros)

  const dataBase = new Date(dataEmprestimo + 'T12:00:00')
  const dataVencimento = new Date(dataBase)
  dataVencimento.setDate(dataVencimento.getDate() + prazoDias)

  return { valorJuros, valorNoVencimento, dataVencimento }
}

export function calcularValorTotal(
  valorNoVencimento: number,
  diasAtraso: number,
  moraReais: number
): number {
  if (diasAtraso <= 0) return round2(valorNoVencimento)
  const mora = round2(moraReais * diasAtraso)
  return round2(valorNoVencimento + mora)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
