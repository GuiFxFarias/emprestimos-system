export type EmprestimoStatus = 'ativo' | 'negociado' | 'quitado'
export type PagamentoTipo = 'parcial' | 'quitacao'
export type PagamentoDestino = 'atraso' | 'juros' | 'principal' | 'quitacao'
export type Situacao = 'em_dia' | 'atrasado' | 'negociado' | 'quitado'

export interface Cliente {
  id: string
  owner_id: string
  nome: string
  telefone: string | null
  documento: string | null
  endereco: string | null
  observacoes: string | null
  foto_url: string | null
  created_at: string
  updated_at: string
}

export interface Configuracoes {
  id: string
  owner_id: string
  taxa_juros_padrao: number
  prazo_padrao_dias: number
  juros_mora_diario_reais: number
  created_at: string
  updated_at: string
}

export interface Emprestimo {
  id: string
  owner_id: string
  cliente_id: string
  valor_principal: number
  taxa_juros: number
  prazo_dias: number
  data_emprestimo: string
  data_vencimento: string
  juros_mora_diario_reais: number
  status: EmprestimoStatus
  data_quitacao: string | null
  valor_quitado: number | null
  data_negociacao: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface EmprestimoCalculado {
  id: string
  owner_id: string
  cliente_id: string
  cliente_nome: string
  cliente_telefone: string | null
  valor_principal: number
  taxa_juros: number
  prazo_dias: number
  data_emprestimo: string
  data_vencimento: string
  juros_mora_diario_reais: number
  status: EmprestimoStatus
  data_quitacao: string | null
  valor_quitado: number | null
  data_negociacao: string | null
  observacoes: string | null
  created_at: string
  valor_juros: number
  valor_no_vencimento: number
  dias_atraso: number
  periodos_atraso: number
  valor_multa: number
  valor_mora: number
  situacao: Situacao
  valor_total_devido: number
}

export interface Pagamento {
  id: string
  owner_id: string
  emprestimo_id: string
  valor: number
  data_pagamento: string
  tipo: PagamentoTipo
  destino: PagamentoDestino | null
  observacoes: string | null
  created_at: string
}

export interface AnotacaoEmprestimo {
  id: string
  owner_id: string
  emprestimo_id: string
  texto: string
  created_at: string
}
