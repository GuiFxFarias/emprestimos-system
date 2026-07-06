import { createClient } from '@/lib/supabase/server'
import type { EmprestimoCalculado, Cliente, Configuracoes } from '@/lib/types'
import type { PagamentoResumo } from '@/lib/queries'

export async function serverFetchEmprestimosCalculados(): Promise<EmprestimoCalculado[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('emprestimos_calculados').select('*')
  return (data ?? []) as EmprestimoCalculado[]
}

export async function serverFetchClientes(): Promise<Cliente[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('clientes').select('*').order('nome')
  return (data ?? []) as Cliente[]
}

export async function serverFetchConfiguracoes(): Promise<Configuracoes | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('configuracoes').select('*').single()
  if (error) return null
  return data as Configuracoes
}

export async function serverFetchAllPagamentos(): Promise<PagamentoResumo[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('pagamentos').select('id, emprestimo_id, valor, destino')
  return (data ?? []) as PagamentoResumo[]
}
