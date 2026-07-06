'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  queryKeys,
  fetchEmprestimosCalculados,
  fetchClientes,
  fetchConfiguracoes,
  fetchClienteDetail,
  type ClienteDetailData,
} from '@/lib/queries'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClienteEmprestimoCard, type ClienteEmprestimoStats } from '@/components/cliente-emprestimo-card'
import { EmprestimoTimeline } from '@/components/emprestimo-timeline'
import { NovoEmprestimoDialog, type EmprestimoFormValues } from '@/components/emprestimo-form'
import { PagamentoDialog, type PagamentoFormValues } from '@/components/pagamento-dialog'
import { EditarEmprestimoDialog, type EditEmprestimoFormValues } from '@/components/editar-emprestimo-dialog'
import { ClienteAvatar } from '@/components/cliente-avatar'
import { HandCoins, Plus, ArrowLeft, Search } from 'lucide-react'
import type { EmprestimoCalculado, Cliente, Configuracoes, AnotacaoEmprestimo } from '@/lib/types'

const HOJE = new Date().toISOString().slice(0, 10)

interface Props {
  initialClientes: Cliente[]
  initialEmprestimos: EmprestimoCalculado[]
  initialConfig: Configuracoes | null
}

export function EmprestimosView({ initialClientes, initialEmprestimos, initialConfig }: Props) {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [openNovo, setOpenNovo] = useState(false)
  const [pagamentoEmp, setPagamentoEmp] = useState<EmprestimoCalculado | null>(null)
  const [editandoEmp, setEditandoEmp] = useState<EmprestimoCalculado | null>(null)

  // ── Queries ───────────────────────────────────────────────────
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: queryKeys.clientes(),
    queryFn: fetchClientes,
    initialData: initialClientes,
  })

  const { data: allEmprestimos = [], isLoading: loadingEmps } = useQuery({
    queryKey: queryKeys.emprestimosCalculados(),
    queryFn: fetchEmprestimosCalculados,
    initialData: initialEmprestimos,
  })

  const { data: config = null } = useQuery({
    queryKey: queryKeys.configuracoes(),
    queryFn: fetchConfiguracoes,
    initialData: initialConfig,
  })

  const loadingList = loadingClientes || loadingEmps

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: queryKeys.clienteDetail(selectedClienteId ?? ''),
    queryFn: () => fetchClienteDetail(selectedClienteId!),
    enabled: !!selectedClienteId,
  })

  // ── Derived data ──────────────────────────────────────────────
  const clienteStats = useMemo((): ClienteEmprestimoStats[] => {
    const statsMap: Record<string, { totalAtivo: number; totalDevido: number; totalJuros: number; totalNegociado: number; temAtrasado: boolean; temNegociado: boolean; temVenceHoje: boolean; ativos: number }> = {}

    for (const e of allEmprestimos) {
      if (!statsMap[e.cliente_id]) {
        statsMap[e.cliente_id] = { totalAtivo: 0, totalDevido: 0, totalJuros: 0, totalNegociado: 0, temAtrasado: false, temNegociado: false, temVenceHoje: false, ativos: 0 }
      }
      if (e.status === 'ativo' || e.status === 'negociado') {
        statsMap[e.cliente_id].ativos++
      }
      if (e.status === 'ativo') {
        statsMap[e.cliente_id].totalAtivo += e.valor_principal
        statsMap[e.cliente_id].totalDevido += e.valor_total_devido
        statsMap[e.cliente_id].totalJuros += e.valor_juros * (1 + e.periodos_atraso)
        if (e.situacao === 'atrasado') statsMap[e.cliente_id].temAtrasado = true
        if (e.situacao === 'em_dia' && e.data_vencimento === HOJE) statsMap[e.cliente_id].temVenceHoje = true
      } else if (e.status === 'negociado') {
        statsMap[e.cliente_id].temNegociado = true
        statsMap[e.cliente_id].totalNegociado += e.valor_total_devido
      }
    }

    return clientes.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      foto_url: c.foto_url,
      totalAtivo: statsMap[c.id]?.totalAtivo ?? 0,
      totalDevido: statsMap[c.id]?.totalDevido ?? 0,
      totalJuros: statsMap[c.id]?.totalJuros ?? 0,
      totalNegociado: statsMap[c.id]?.totalNegociado ?? 0,
      temAtrasado: statsMap[c.id]?.temAtrasado ?? false,
      temNegociado: statsMap[c.id]?.temNegociado ?? false,
      temVenceHoje: statsMap[c.id]?.temVenceHoje ?? false,
      emprestimosAtivos: statsMap[c.id]?.ativos ?? 0,
    }))
  }, [clientes, allEmprestimos])

  const filteredClientes = useMemo(() =>
    clienteStats.filter(c =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      (c.telefone ?? '').includes(search)
    ),
    [clienteStats, search]
  )

  const selectedCliente = selectedClienteId ? clientes.find(c => c.id === selectedClienteId) : null

  // ── Invalidation helper ───────────────────────────────────────
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: queryKeys.emprestimosCalculados() })
    queryClient.invalidateQueries({ queryKey: queryKeys.clientes() })
    queryClient.invalidateQueries({ queryKey: queryKeys.pagamentos() })
    if (selectedClienteId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.clienteDetail(selectedClienteId) })
    }
  }

  // ── Mutations ─────────────────────────────────────────────────
  const novoEmprestimoMutation = useMutation({
    mutationFn: async (values: EmprestimoFormValues) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('emprestimos').insert({
        owner_id: user!.id,
        cliente_id: values.cliente_id,
        valor_principal: values.valor_principal,
        taxa_juros: values.taxa_juros,
        prazo_dias: values.prazo_dias,
        juros_mora_diario_reais: values.juros_mora_diario_reais,
        data_emprestimo: values.data_emprestimo,
        observacoes: values.observacoes || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Empréstimo criado!')
      setOpenNovo(false)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Erro ao criar empréstimo: ' + err.message),
  })

  const pagamentoMutation = useMutation({
    mutationFn: async (values: PagamentoFormValues) => {
      if (!pagamentoEmp) return
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const tipo = values.destino === 'quitacao' ? 'quitacao' : 'parcial'

      const { error: pagError } = await supabase.from('pagamentos').insert({
        owner_id: user!.id,
        emprestimo_id: pagamentoEmp.id,
        valor: values.valor,
        data_pagamento: values.data_pagamento,
        tipo,
        destino: values.destino,
        observacoes: values.observacoes || null,
      })
      if (pagError) throw new Error(pagError.message)

      if (values.destino === 'quitacao') {
        const { error: updError } = await supabase.from('emprestimos').update({
          status: 'quitado',
          data_quitacao: values.data_pagamento,
          valor_quitado: values.valor,
        }).eq('id', pagamentoEmp.id)
        if (updError) throw new Error(updError.message)
      }
    },
    onSuccess: (_, values) => {
      const msgs: Record<string, string> = {
        quitacao: 'Empréstimo quitado!',
        principal: 'Pagamento do principal registrado!',
        juros: 'Pagamento dos juros registrado!',
        atraso: 'Pagamento da mora registrado!',
      }
      toast.success(msgs[values.destino] ?? 'Pagamento registrado!')
      setPagamentoEmp(null)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Erro ao registrar pagamento: ' + err.message),
  })

  const deleteEmprestimoMutation = useMutation({
    mutationFn: async (empId: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('emprestimos').delete().eq('id', empId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Empréstimo excluído!')
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Erro ao excluir: ' + err.message),
  })

  const editEmprestimoMutation = useMutation({
    mutationFn: async (values: EditEmprestimoFormValues) => {
      if (!editandoEmp) return
      const supabase = createClient()
      const { error } = await supabase.from('emprestimos').update({
        valor_principal: values.valor_principal,
        taxa_juros: values.taxa_juros,
        prazo_dias: values.prazo_dias,
        juros_mora_diario_reais: values.juros_mora_diario_reais,
        data_emprestimo: values.data_emprestimo,
        observacoes: values.observacoes || null,
        status: values.status,
        data_quitacao: values.status === 'quitado' ? (values.data_quitacao || null) : null,
        valor_quitado: values.status === 'quitado' ? (values.valor_quitado ?? null) : null,
        data_negociacao: values.status === 'negociado' && values.congelar_negociacao ? (values.data_negociacao || null) : null,
      }).eq('id', editandoEmp.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Empréstimo atualizado!')
      setEditandoEmp(null)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Erro ao salvar: ' + err.message),
  })

  // ── Anotações (optimistic via setQueryData) ───────────────────
  async function handleAddAnotacao(empId: string, texto: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: nova, error } = await supabase
      .from('anotacoes_emprestimo')
      .insert({ owner_id: user!.id, emprestimo_id: empId, texto })
      .select()
      .single()

    if (error) { toast.error('Erro ao adicionar anotação: ' + error.message); return }

    if (nova && selectedClienteId) {
      queryClient.setQueryData<ClienteDetailData>(
        queryKeys.clienteDetail(selectedClienteId),
        old => {
          if (!old) return old
          return {
            ...old,
            anotacoesPorEmp: {
              ...old.anotacoesPorEmp,
              [empId]: [nova as AnotacaoEmprestimo, ...(old.anotacoesPorEmp[empId] ?? [])],
            },
          }
        }
      )
    }
  }

  async function handleDeleteAnotacao(anotId: string, empId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('anotacoes_emprestimo').delete().eq('id', anotId)

    if (error) { toast.error('Erro ao excluir anotação: ' + error.message); return }

    if (selectedClienteId) {
      queryClient.setQueryData<ClienteDetailData>(
        queryKeys.clienteDetail(selectedClienteId),
        old => {
          if (!old) return old
          return {
            ...old,
            anotacoesPorEmp: {
              ...old.anotacoesPorEmp,
              [empId]: (old.anotacoesPorEmp[empId] ?? []).filter(a => a.id !== anotId),
            },
          }
        }
      )
    }
  }

  // ── CLIENT LIST VIEW ──────────────────────────────────────────
  if (!selectedClienteId) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Empréstimos</h1>
          </div>
          <Button
            onClick={() => setOpenNovo(true)}
            size="sm"
            className="gap-2 font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo</span>
          </Button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>

        {loadingList ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 rounded-2xl" style={{ background: 'var(--muted)' }} />
            ))}
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <HandCoins className="w-12 h-12" style={{ color: 'var(--muted-foreground)' }} />
            <p style={{ color: 'var(--muted-foreground)' }}>
              {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredClientes.map(c => (
              <ClienteEmprestimoCard
                key={c.id}
                cliente={c}
                onClick={() => setSelectedClienteId(c.id)}
              />
            ))}
          </div>
        )}

        <NovoEmprestimoDialog
          open={openNovo}
          onOpenChange={setOpenNovo}
          clientes={clientes}
          config={config}
          onSubmit={async v => { novoEmprestimoMutation.mutate(v) }}
          saving={novoEmprestimoMutation.isPending}
        />
      </div>
    )
  }

  // ── CLIENT LOANS VIEW ─────────────────────────────────────────
  const emprestimos = detail?.emprestimos ?? []
  const pagamentosPorEmp = detail?.pagamentosPorEmp ?? {}
  const anotacoesPorEmp = detail?.anotacoesPorEmp ?? {}

  const sorted = [...emprestimos].sort((a, b) => {
    const priority = (e: EmprestimoCalculado) => {
      if (e.situacao === 'atrasado') return 0
      if (e.situacao === 'em_dia' && e.data_vencimento === HOJE) return 1
      if (e.situacao === 'em_dia') return 2
      return 3
    }
    return priority(a) - priority(b)
  })

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost" size="icon"
            onClick={() => setSelectedClienteId(null)}
            className="shrink-0"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {selectedCliente && (
            <>
              <ClienteAvatar fotoPath={selectedCliente.foto_url} nome={selectedCliente.nome} size={36} />
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate" style={{ color: 'var(--foreground)' }}>
                  {selectedCliente.nome}
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {emprestimos.length} empréstimo{emprestimos.length !== 1 ? 's' : ''}
                  {emprestimos.filter(e => e.status === 'ativo').length > 0 && (
                    <> · {emprestimos.filter(e => e.status === 'ativo').length} ativo{emprestimos.filter(e => e.status === 'ativo').length !== 1 ? 's' : ''}</>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
        <Button
          onClick={() => setOpenNovo(true)}
          size="sm"
          className="gap-2 font-semibold shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo empréstimo</span>
        </Button>
      </div>

      {loadingDetail ? (
        <div className="flex flex-col gap-4">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-48 rounded-2xl" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <HandCoins className="w-12 h-12" style={{ color: 'var(--muted-foreground)' }} />
          <p style={{ color: 'var(--muted-foreground)' }}>Nenhum empréstimo para este cliente</p>
          <Button
            onClick={() => setOpenNovo(true)}
            variant="outline" size="sm"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            Criar primeiro empréstimo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map(e => (
            <EmprestimoTimeline
              key={e.id}
              e={e}
              pagamentos={pagamentosPorEmp[e.id] ?? []}
              anotacoes={anotacoesPorEmp[e.id] ?? []}
              onPagamento={() => setPagamentoEmp(e)}
              onEdit={() => setEditandoEmp(e)}
              onDelete={async () => { deleteEmprestimoMutation.mutate(e.id) }}
              onAddAnotacao={texto => handleAddAnotacao(e.id, texto)}
              onDeleteAnotacao={anotId => handleDeleteAnotacao(anotId, e.id)}
              hoje={HOJE}
            />
          ))}
        </div>
      )}

      <NovoEmprestimoDialog
        open={openNovo}
        onOpenChange={setOpenNovo}
        clientes={clientes}
        config={config}
        onSubmit={async v => { novoEmprestimoMutation.mutate(v) }}
        saving={novoEmprestimoMutation.isPending}
        defaultClienteId={selectedClienteId ?? undefined}
      />

      <PagamentoDialog
        emprestimo={pagamentoEmp}
        pagamentos={pagamentoEmp ? (pagamentosPorEmp[pagamentoEmp.id] ?? []) : []}
        onClose={() => setPagamentoEmp(null)}
        onSubmit={async v => { pagamentoMutation.mutate(v) }}
        saving={pagamentoMutation.isPending}
      />

      <EditarEmprestimoDialog
        emprestimo={editandoEmp}
        onClose={() => setEditandoEmp(null)}
        onSubmit={async v => { editEmprestimoMutation.mutate(v) }}
        saving={editEmprestimoMutation.isPending}
      />
    </div>
  )
}
