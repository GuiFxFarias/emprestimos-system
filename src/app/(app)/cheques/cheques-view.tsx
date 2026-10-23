'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys, fetchCheques, fetchClientes } from '@/lib/queries'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/metric-card'
import { ChequeDialog, CompensarChequeDialog, type ChequeFormValues } from '@/components/cheque-dialog'
import { ClienteChequeCard, type ClienteChequeStats } from '@/components/cliente-cheque-card'
import { ClienteAvatar } from '@/components/cliente-avatar'
import {
  hojeLocal,
  jurosCheque,
  entregueCheque,
  diasParaVencer,
  situacaoCheque,
  SITUACAO_CHEQUE_INFO,
  DIAS_ALERTA_CHEQUE,
  type SituacaoCheque,
} from '@/lib/cheques'
import {
  ArrowLeft,
  Receipt,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Undo2,
  Ban,
  AlertCircle,
  Wallet,
  DollarSign,
} from 'lucide-react'
import type { Cheque, ChequeComCliente, ChequeStatus, Cliente } from '@/lib/types'

type Filtro = 'abertos' | 'compensados' | 'todos'

// da mais urgente pra menos — define a ordem dos clientes na lista
const PRIORIDADE_SITUACAO: SituacaoCheque[] = ['devolvido', 'vencido', 'vence_hoje', 'vence_em_breve', 'aguardando']

interface Props {
  initialCheques: ChequeComCliente[]
  initialClientes: Cliente[]
}

export function ChequesView({ initialCheques, initialClientes }: Props) {
  const queryClient = useQueryClient()
  const hoje = hojeLocal()

  const [search, setSearch] = useState('')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Cheque | null>(null)
  const [compensando, setCompensando] = useState<Cheque | null>(null)

  const { data: cheques = [] } = useQuery({
    queryKey: queryKeys.cheques(),
    queryFn: fetchCheques,
    initialData: initialCheques,
  })

  const { data: clientes = [] } = useQuery({
    queryKey: queryKeys.clientes(),
    queryFn: fetchClientes,
    initialData: initialClientes,
  })

  const abertos = useMemo(() => cheques.filter(c => c.status !== 'compensado'), [cheques])

  const resumo = useMemo(() => {
    const capital = abertos.reduce((s, c) => s + entregueCheque(c), 0)
    const juros = abertos.reduce((s, c) => s + jurosCheque(c), 0)
    const urgentes = abertos.filter(c => SITUACAO_CHEQUE_INFO[situacaoCheque(c, hoje)].urgente).length
    return { capital, juros, urgentes }
  }, [abertos, hoje])

  const chequesPorCliente = useMemo(() => {
    const map: Record<string, ChequeComCliente[]> = {}
    for (const c of cheques) (map[c.cliente_id] ??= []).push(c)
    return map
  }, [cheques])

  // Só entram na lista clientes que já trocaram cheque; os com cheque
  // urgente (devolvido/vencido/vencendo) sobem pro topo
  const clienteStats = useMemo((): ClienteChequeStats[] => {
    const stats = clientes
      .filter(cl => chequesPorCliente[cl.id]?.length)
      .map(cl => {
        const doCliente = chequesPorCliente[cl.id]
        const abertosCl = doCliente.filter(c => c.status !== 'compensado')
        let pior: SituacaoCheque | null = null
        for (const c of abertosCl) {
          const s = situacaoCheque(c, hoje)
          if (pior === null || PRIORIDADE_SITUACAO.indexOf(s) < PRIORIDADE_SITUACAO.indexOf(pior)) pior = s
        }
        return {
          id: cl.id,
          nome: cl.nome,
          telefone: cl.telefone,
          foto_url: cl.foto_url,
          aReceber: abertosCl.reduce((s, c) => s + c.valor, 0),
          juros: abertosCl.reduce((s, c) => s + jurosCheque(c), 0),
          entregue: abertosCl.reduce((s, c) => s + entregueCheque(c), 0),
          abertos: abertosCl.length,
          compensados: doCliente.length - abertosCl.length,
          pior,
        }
      })
    const rank = (c: ClienteChequeStats) =>
      c.pior === null ? PRIORIDADE_SITUACAO.length : PRIORIDADE_SITUACAO.indexOf(c.pior)
    return stats.sort((a, b) => rank(a) - rank(b))
  }, [clientes, chequesPorCliente, hoje])

  const filteredClientes = useMemo(() => {
    const termo = search.trim().toLowerCase()
    if (!termo) return clienteStats
    return clienteStats.filter(cl =>
      cl.nome.toLowerCase().includes(termo) ||
      (cl.telefone ?? '').includes(termo) ||
      chequesPorCliente[cl.id].some(c =>
        (c.banco ?? '').toLowerCase().includes(termo) ||
        (c.numero ?? '').toLowerCase().includes(termo)
      )
    )
  }, [clienteStats, chequesPorCliente, search])

  const selectedCliente = selectedClienteId ? clientes.find(c => c.id === selectedClienteId) : null
  const doCliente = useMemo(
    () => (selectedClienteId ? chequesPorCliente[selectedClienteId] ?? [] : []),
    [chequesPorCliente, selectedClienteId]
  )
  const abertosCliente = useMemo(() => doCliente.filter(c => c.status !== 'compensado'), [doCliente])

  const lista = useMemo(() => {
    const base = filtro === 'abertos'
      ? abertosCliente
      : filtro === 'compensados'
      ? doCliente.filter(c => c.status === 'compensado')
      : doCliente
    // compensados: mais recentes primeiro; abertos: vencimento mais próximo primeiro
    return [...base].sort((a, b) =>
      filtro === 'compensados'
        ? (b.data_compensacao ?? b.data_vencimento).localeCompare(a.data_compensacao ?? a.data_vencimento)
        : a.data_vencimento.localeCompare(b.data_vencimento)
    )
  }, [doCliente, abertosCliente, filtro])

  function abrirCliente(cl: ClienteChequeStats) {
    setFiltro(cl.abertos > 0 ? 'abertos' : 'todos')
    setSelectedClienteId(cl.id)
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.cheques() })
  }

  const salvarMutation = useMutation({
    mutationFn: async (values: ChequeFormValues) => {
      const supabase = createClient()
      const payload = {
        cliente_id: values.cliente_id,
        valor: values.valor,
        taxa_juros: values.taxa_juros,
        data_entrada: values.data_entrada,
        data_vencimento: values.data_vencimento,
        banco: values.banco?.trim() || null,
        numero: values.numero?.trim() || null,
        observacoes: values.observacoes?.trim() || null,
      }
      if (editando) {
        const { error } = await supabase.from('cheques').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from('cheques').insert({ owner_id: user!.id, ...payload })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(editando ? 'Cheque atualizado!' : 'Cheque cadastrado!')
      fecharDialog()
      invalidate()
    },
    onError: (err: Error) => toast.error('Erro ao salvar cheque: ' + err.message),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, data_compensacao }: { id: string; status: ChequeStatus; data_compensacao: string | null }) => {
      const supabase = createClient()
      const { error } = await supabase.from('cheques').update({ status, data_compensacao }).eq('id', id)
      if (error) throw new Error(error.message)
      return status
    },
    onSuccess: status => {
      const msgs: Record<ChequeStatus, string> = {
        compensado: 'Cheque compensado!',
        devolvido: 'Cheque marcado como devolvido',
        a_compensar: 'Cheque voltou para "a compensar"',
      }
      toast.success(msgs[status])
      setCompensando(null)
      invalidate()
    },
    onError: (err: Error) => toast.error('Erro ao atualizar cheque: ' + err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('cheques').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Cheque excluído!')
      invalidate()
    },
    onError: (err: Error) => toast.error('Erro ao excluir: ' + err.message),
  })

  function abrirNovo() {
    setEditando(null)
    setDialogAberto(true)
  }

  function fecharDialog() {
    setDialogAberto(false)
    setEditando(null)
  }

  const dialogs = (
    <>
      <ChequeDialog
        open={dialogAberto}
        cheque={editando}
        clientes={clientes}
        onClose={fecharDialog}
        onSubmit={async v => { salvarMutation.mutate(v) }}
        saving={salvarMutation.isPending}
        defaultClienteId={selectedClienteId ?? undefined}
      />

      <CompensarChequeDialog
        cheque={compensando}
        onClose={() => setCompensando(null)}
        onConfirm={async data => {
          if (compensando) statusMutation.mutate({ id: compensando.id, status: 'compensado', data_compensacao: data })
        }}
        saving={statusMutation.isPending}
      />
    </>
  )

  // ── CLIENT LIST VIEW ──────────────────────────────────────────
  if (!selectedClienteId) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Receipt className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Cheques</h1>
          </div>
          <Button
            onClick={abrirNovo}
            size="sm"
            className="gap-2 font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo cheque</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <MetricCard
            label="A receber (em aberto)"
            value={formatBRL(resumo.capital + resumo.juros)}
            sub={`${abertos.length} cheque${abertos.length !== 1 ? 's' : ''}`}
            icon={<Wallet className="w-5 h-5" />}
            color="var(--primary)"
          />
          <MetricCard
            label="Juros a receber"
            value={formatBRL(resumo.juros)}
            sub={`sobre ${formatBRL(resumo.capital)} entregues`}
            icon={<DollarSign className="w-5 h-5" />}
            color="#00e5cc"
          />
          <MetricCard
            label="Precisam de atenção"
            value={String(resumo.urgentes)}
            sub={`vencidos, devolvidos ou vencendo em ${DIAS_ALERTA_CHEQUE} dias`}
            icon={<AlertCircle className="w-5 h-5" />}
            color={resumo.urgentes > 0 ? 'var(--destructive)' : 'var(--muted-foreground)'}
          />
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Buscar por cliente, banco ou nº..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>

        {filteredClientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Receipt className="w-12 h-12" style={{ color: 'var(--muted-foreground)' }} />
            <p style={{ color: 'var(--muted-foreground)' }}>
              {search ? 'Nenhum cliente encontrado' : 'Nenhum cheque cadastrado'}
            </p>
            {!search && (
              <Button
                onClick={abrirNovo}
                variant="outline" size="sm"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                Cadastrar cheque
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredClientes.map(cl => (
              <ClienteChequeCard key={cl.id} cliente={cl} onClick={() => abrirCliente(cl)} />
            ))}
          </div>
        )}

        {dialogs}
      </div>
    )
  }

  // ── CLIENT CHEQUES VIEW ───────────────────────────────────────
  const filtros: { value: Filtro; label: string; count: number }[] = [
    { value: 'abertos', label: 'Em aberto', count: abertosCliente.length },
    { value: 'compensados', label: 'Compensados', count: doCliente.length - abertosCliente.length },
    { value: 'todos', label: 'Todos', count: doCliente.length },
  ]
  const aReceberCliente = abertosCliente.reduce((s, c) => s + c.valor, 0)

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
                  {doCliente.length} cheque{doCliente.length !== 1 ? 's' : ''}
                  {abertosCliente.length > 0 && <> · {abertosCliente.length} em aberto</>}
                </p>
                {abertosCliente.length > 0 && (
                  <p className="text-xs font-medium" style={{ color: '#00e5cc' }}>
                    A receber {formatBRL(aReceberCliente)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <Button
          onClick={abrirNovo}
          size="sm"
          className="gap-2 font-semibold shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo cheque</span>
        </Button>
      </div>

      <div className="flex rounded-xl p-1 gap-1 mb-4 sm:w-fit" style={{ background: 'var(--muted)' }}>
        {filtros.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltro(f.value)}
            className={`flex-1 sm:flex-none text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
              filtro === f.value ? 'font-semibold text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Receipt className="w-12 h-12" style={{ color: 'var(--muted-foreground)' }} />
          <p style={{ color: 'var(--muted-foreground)' }}>
            {filtro === 'compensados' ? 'Nenhum cheque compensado ainda' : filtro === 'abertos' ? 'Nenhum cheque em aberto' : 'Nenhum cheque para este cliente'}
          </p>
          {filtro !== 'compensados' && (
            <Button
              onClick={abrirNovo}
              variant="outline" size="sm"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Cadastrar cheque
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(c => (
            <ChequeCard
              key={c.id}
              cheque={c}
              hoje={hoje}
              busy={statusMutation.isPending}
              onEdit={() => { setEditando(c); setDialogAberto(true) }}
              onDelete={async () => { await deleteMutation.mutateAsync(c.id).catch(() => {}) }}
              onCompensar={() => setCompensando(c)}
              onDevolvido={() => statusMutation.mutate({ id: c.id, status: 'devolvido', data_compensacao: null })}
              onReabrir={() => statusMutation.mutate({ id: c.id, status: 'a_compensar', data_compensacao: null })}
            />
          ))}
        </div>
      )}

      {dialogs}
    </div>
  )
}

interface ChequeCardProps {
  cheque: ChequeComCliente
  hoje: string
  busy: boolean
  onEdit: () => void
  onDelete: () => Promise<void>
  onCompensar: () => void
  onDevolvido: () => void
  onReabrir: () => void
}

function ChequeCard({ cheque: c, hoje, busy, onEdit, onDelete, onCompensar, onDevolvido, onReabrir }: ChequeCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const situacao = situacaoCheque(c, hoje)
  const info = SITUACAO_CHEQUE_INFO[situacao]
  const dias = diasParaVencer(c, hoje)
  const juros = jurosCheque(c)

  const prazoTexto = situacao === 'compensado'
    ? `Compensado em ${formatDate(c.data_compensacao ?? c.data_vencimento)}`
    : situacao === 'devolvido'
    ? `Devolvido — venceu em ${formatDate(c.data_vencimento)}`
    : dias < 0
    ? `Venceu há ${-dias} dia${dias !== -1 ? 's' : ''} (${formatDate(c.data_vencimento)})`
    : dias === 0
    ? 'Vence hoje'
    : `Vence em ${dias} dia${dias !== 1 ? 's' : ''} (${formatDate(c.data_vencimento)})`

  async function handleDelete() {
    setDeleting(true)
    await onDelete()
    setDeleting(false)
    setConfirmDelete(false)
  }

  const iconBtn = 'h-7 w-7'
  const mutedStyle = { color: 'var(--muted-foreground)' }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'var(--card)',
        borderColor: info.urgente ? `color-mix(in srgb, ${info.color} 50%, transparent)` : 'var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
            {[c.banco, c.numero && `nº ${c.numero}`].filter(Boolean).join(' · ') || 'Cheque'}
          </p>
          <p className="text-xs" style={mutedStyle}>
            Trocado em {formatDate(c.data_entrada)}
          </p>
        </div>
        <Badge
          className="text-xs shrink-0"
          style={{ background: `color-mix(in srgb, ${info.color} 15%, transparent)`, color: info.color, border: 'none' }}
        >
          {situacao === 'compensado' && <CheckCircle2 className="w-3 h-3 mr-1" />}
          {info.urgente && situacao !== 'vence_em_breve' && <AlertCircle className="w-3 h-3 mr-1" />}
          {info.label}
        </Badge>
      </div>

      <div className="mt-3 rounded-xl px-3 py-2.5 text-xs grid grid-cols-3 gap-2" style={{ background: 'var(--muted)' }}>
        <div>
          <p style={mutedStyle}>{situacao === 'compensado' ? 'Cheque (recebido)' : 'Valor do cheque'}</p>
          <p className="font-bold text-sm" style={{ color: '#00e5cc' }}>{formatBRL(c.valor)}</p>
        </div>
        <div>
          <p style={mutedStyle}>Juros ({c.taxa_juros}%)</p>
          <p className="font-medium text-sm" style={{ color: 'var(--primary)' }}>{formatBRL(juros)}</p>
        </div>
        <div>
          <p style={mutedStyle}>Entregue ao cliente</p>
          <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{formatBRL(entregueCheque(c))}</p>
        </div>
      </div>

      <p className="text-xs mt-2 font-medium" style={{ color: situacao === 'aguardando' ? 'var(--muted-foreground)' : info.color }}>
        {prazoTexto}
      </p>
      {c.observacoes && (
        <p className="text-xs mt-1 whitespace-pre-wrap" style={mutedStyle}>{c.observacoes}</p>
      )}

      <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
        {confirmDelete ? (
          <>
            <span className="text-xs font-medium" style={{ color: '#ff5470' }}>Excluir este cheque?</span>
            <Button
              size="sm" disabled={deleting} onClick={handleDelete}
              className="h-7 px-2 text-xs font-semibold"
              style={{ background: '#ff5470', color: '#fff' }}
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim'}
            </Button>
            <Button
              size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}
              className="h-7 px-2 text-xs" style={mutedStyle}
            >
              Não
            </Button>
          </>
        ) : (
          <>
            <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(true)}
              className={`${iconBtn} hover:bg-destructive/10`} style={mutedStyle} title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onEdit}
              className={`${iconBtn} hover:bg-primary/10`} style={mutedStyle} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {c.status === 'compensado' ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={onReabrir}
                className="h-7 px-2.5 text-xs gap-1" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                <Undo2 className="w-3.5 h-3.5" /> Desfazer compensação
              </Button>
            ) : (
              <>
                {c.status === 'a_compensar' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={onDevolvido}
                    className="h-7 px-2.5 text-xs gap-1" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <Ban className="w-3.5 h-3.5" /> Devolvido
                  </Button>
                )}
                {c.status === 'devolvido' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={onReabrir}
                    className="h-7 px-2.5 text-xs gap-1" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <Undo2 className="w-3.5 h-3.5" /> Voltar a compensar
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={onCompensar}
                  className="h-7 px-3 text-xs font-semibold gap-1 hover:brightness-110 active:scale-95"
                  style={{ background: '#00e5cc', color: '#040d1f' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Compensado
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
