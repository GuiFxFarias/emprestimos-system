import { createClient } from '@/lib/supabase/client'
import type { EmprestimoCalculado, Cliente, Configuracoes, Pagamento, AnotacaoEmprestimo } from '@/lib/types'

// ── Query Keys ────────────────────────────────────────────────
export const queryKeys = {
  emprestimosCalculados: () => ['emprestimos_calculados'] as const,
  clienteDetail: (clienteId: string) => ['emprestimos_calculados', clienteId] as const,
  clientes: () => ['clientes'] as const,
  configuracoes: () => ['configuracoes'] as const,
}

// ── Client-side fetchers ───────────────────────────────────────
export async function fetchEmprestimosCalculados(): Promise<EmprestimoCalculado[]> {
  const supabase = createClient()
  const { data } = await supabase.from('emprestimos_calculados').select('*')
  return (data ?? []) as EmprestimoCalculado[]
}

export async function fetchClientes(): Promise<Cliente[]> {
  const supabase = createClient()
  const { data } = await supabase.from('clientes').select('*').order('nome')
  return (data ?? []) as Cliente[]
}

export async function fetchConfiguracoes(): Promise<Configuracoes | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from('configuracoes').select('*').single()
  if (error) return null
  return data as Configuracoes
}

export interface ClienteDetailData {
  emprestimos: EmprestimoCalculado[]
  pagamentosPorEmp: Record<string, Pagamento[]>
  anotacoesPorEmp: Record<string, AnotacaoEmprestimo[]>
}

export async function fetchClienteDetail(clienteId: string): Promise<ClienteDetailData> {
  const supabase = createClient()
  const { data: emps } = await supabase
    .from('emprestimos_calculados')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data_emprestimo', { ascending: false })

  if (!emps?.length) return { emprestimos: [], pagamentosPorEmp: {}, anotacoesPorEmp: {} }

  const empIds = emps.map(e => e.id)
  const [{ data: pags }, { data: anots }] = await Promise.all([
    supabase.from('pagamentos').select('*').in('emprestimo_id', empIds).order('data_pagamento'),
    supabase
      .from('anotacoes_emprestimo')
      .select('*')
      .in('emprestimo_id', empIds)
      .order('created_at', { ascending: false }),
  ])

  const pagamentosPorEmp: Record<string, Pagamento[]> = {}
  for (const p of pags ?? []) {
    if (!pagamentosPorEmp[p.emprestimo_id]) pagamentosPorEmp[p.emprestimo_id] = []
    pagamentosPorEmp[p.emprestimo_id].push(p)
  }

  const anotacoesPorEmp: Record<string, AnotacaoEmprestimo[]> = {}
  for (const a of anots ?? []) {
    if (!anotacoesPorEmp[a.emprestimo_id]) anotacoesPorEmp[a.emprestimo_id] = []
    anotacoesPorEmp[a.emprestimo_id].push(a)
  }

  return {
    emprestimos: emps as EmprestimoCalculado[],
    pagamentosPorEmp,
    anotacoesPorEmp,
  }
}
