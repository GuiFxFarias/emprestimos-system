'use client'

import { memo, useState } from 'react'
import { addDays, differenceInCalendarDays, parseISO, format as formatDateFns } from 'date-fns'
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, CheckCircle2, Clock, CreditCard, TrendingUp, Pencil, MessageSquarePlus, Trash2, Loader2 } from 'lucide-react'
import { formatBRL, formatDate } from '@/lib/format'
import type { EmprestimoCalculado, Pagamento, AnotacaoEmprestimo } from '@/lib/types'

function addDiasToDataString(dateStr: string, dias: number): string {
  return formatDateFns(addDays(parseISO(dateStr), dias), 'yyyy-MM-dd')
}

interface Props {
  e: EmprestimoCalculado
  pagamentos: Pagamento[]
  anotacoes: AnotacaoEmprestimo[]
  onPagamento: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  onAddAnotacao: (texto: string) => Promise<void>
  onDeleteAnotacao: (id: string) => Promise<void>
  hoje: string
}

function labelDestino(destino: string | null, tipo: string, antecipado?: boolean): string {
  switch (destino) {
    case 'quitacao':  return tipo === 'quitacao' ? 'Quitação' : 'Pagamento (negociado)'
    case 'principal': return 'Pagamento — Principal'
    case 'juros':     return antecipado ? 'Pagamento — Juros (adiantamento)' : 'Pagamento — Juros'
    case 'atraso':    return 'Pagamento — Mora'
    default:          return tipo === 'quitacao' ? 'Quitação' : 'Pagamento parcial'
  }
}

interface TimelineItem {
  date: string
  label: string
  value?: number
  type: 'criado' | 'pagamento' | 'vencimento' | 'vencimento_passado' | 'quitado'
}

export const EmprestimoTimeline = memo(function EmprestimoTimeline({
  e, pagamentos, anotacoes, onPagamento, onEdit, onDelete, onAddAnotacao, onDeleteAnotacao, hoje,
}: Props) {
  const [novaAnotacao, setNovaAnotacao] = useState('')
  const [savingAnotacao, setSavingAnotacao] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingEmp, setDeletingEmp] = useState(false)

  async function handleDelete() {
    setDeletingEmp(true)
    await onDelete()
    setDeletingEmp(false)
    setConfirmDelete(false)
  }

  const venceHoje = e.situacao === 'em_dia' && e.data_vencimento === hoje
  const atrasado = e.situacao === 'atrasado'
  const quitado = e.status === 'quitado'
  const negociado = e.status === 'negociado'
  const negociadoComValor = negociado && e.valor_negociado != null
  const retroativo = e.retroativo

  const pagoAtraso = pagamentos
    .filter(p => p.destino === 'atraso')
    .reduce((s, p) => s + p.valor, 0)
  // "pago" também é true quando não há mora a pagar (nada devido = nada pendente)
  const atrasoPago = e.valor_mora <= 0.005 || pagoAtraso >= e.valor_mora - 0.005

  const jurosTotal = Number((e.valor_juros * (1 + e.periodos_atraso)).toFixed(2))
  const pagoJuros = pagamentos.filter(p => p.destino === 'juros').reduce((s, p) => s + p.valor, 0)
  const jurosPago = jurosTotal <= 0.005 || pagoJuros >= jurosTotal - 0.005

  const pagoPrincipal = pagamentos.filter(p => p.destino === 'principal').reduce((s, p) => s + p.valor, 0)

  // marca quais pagamentos de juros foram adiantamentos: refaz a conta de
  // "quanto era devido na data" (mesma fórmula de periodos_atraso da view
  // emprestimos_calculados) na ordem em que os pagamentos aconteceram — se
  // nada ainda era devido antes dele, o pagamento é um adiantamento
  const jurosAntecipadoIds = new Set<string>()
  if (e.valor_juros > 0) {
    const jurosPagamentos = [...pagamentos]
      .filter(p => p.destino === 'juros')
      .sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento) || a.created_at.localeCompare(b.created_at))

    let pagoAcumulado = 0
    for (const p of jurosPagamentos) {
      const diasDesdeVencimento = differenceInCalendarDays(parseISO(p.data_pagamento), parseISO(e.data_vencimento))
      const periodosAtrasoNaData = diasDesdeVencimento <= 0 ? 0 : Math.floor(diasDesdeVencimento / e.prazo_dias)
      const devidoNaData = e.valor_juros * (1 + periodosAtrasoNaData)
      if (pagoAcumulado >= devidoNaData - 0.005) {
        jurosAntecipadoIds.add(p.id)
      }
      pagoAcumulado += p.valor
    }
  }

  // Atrasado mas com juros e mora do período em dia: não é mais "atrasado", é "em aberto"
  // (só falta o principal — deixa de gerar urgência até vencer um novo período)
  const emAberto = atrasado && atrasoPago && jurosPago

  const totalPago = pagamentos
    .filter(p => p.tipo === 'parcial')
    .reduce((sum, p) => sum + p.valor, 0)

  // Negociado com valor: é um acordo à parte — pagamentos de antes de
  // negociar (juros/principal/atraso da fórmula antiga) não abatem, só o
  // que foi pago como "quitação" do próprio acordo conta.
  const pagoNegociado = pagamentos
    .filter(p => p.destino === 'quitacao')
    .reduce((s, p) => s + p.valor, 0)

  // Restante por categoria (capado em 0): pagar a mais numa categoria (ex.: 3000
  // de juros quando só 1800 é devido) não pode abater o que falta nas outras.
  // Negociado com valor manual é exceção — o total já é um número fechado.
  const principalRestante = Math.max(0, e.valor_principal - pagoPrincipal)
  const jurosRestante = Math.max(0, jurosTotal - pagoJuros)
  const moraRestante = Math.max(0, e.valor_mora - pagoAtraso)
  const pagoEfetivo = (e.valor_principal - principalRestante) + (jurosTotal - jurosRestante) + (e.valor_mora - moraRestante)
  const saldoDevedor = negociadoComValor
    ? Math.round(Math.max(0, e.valor_total_devido - pagoNegociado) * 100) / 100
    : Math.round((principalRestante + jurosRestante + moraRestante) * 100) / 100

  const borderClass = atrasado && !jurosPago ? 'pulse-danger' : ''
  const borderColor = emAberto
    ? 'var(--border)'
    : atrasado
    ? 'rgba(255,84,112,0.5)'
    : venceHoje
    ? 'var(--destructive)'
    : quitado
    ? 'rgba(0,229,204,0.3)'
    : negociado
    ? 'rgba(139,92,246,0.3)'
    : 'var(--border)'

  const timelineItems: TimelineItem[] = [
    {
      date: e.data_emprestimo,
      label: retroativo
        ? `Empréstimo de ${formatBRL(e.valor_principal)} (retroativo, sem juros/mora)`
        : `Empréstimo de ${formatBRL(e.valor_principal)} (${e.taxa_juros}% juros, ${e.prazo_dias}d)`,
      value: e.valor_principal,
      type: 'criado',
    },
    ...pagamentos.map(p => ({
      date: p.data_pagamento,
      label: `${labelDestino(p.destino, p.tipo, jurosAntecipadoIds.has(p.id))} — ${formatBRL(p.valor)}`,
      value: p.valor,
      type: (p.tipo === 'quitacao' ? 'quitado' : 'pagamento') as TimelineItem['type'],
    })),
  ]

  if (quitado && e.data_quitacao) {
    const alreadyHasQuitacao = pagamentos.some(p => p.tipo === 'quitacao')
    if (!alreadyHasQuitacao) {
      timelineItems.push({
        date: e.data_quitacao,
        label: `Quitado — ${formatBRL(e.valor_quitado ?? 0)}`,
        type: 'quitado',
      })
    }
  } else {
    // Um item por período de vencimento: os já vencidos sem pagamento (histórico
    // de renovação) e o próximo — que vira uma nova renovação se não for pago.
    for (let periodo = 0; periodo <= e.periodos_atraso; periodo++) {
      const dataPeriodo = addDiasToDataString(e.data_vencimento, periodo * e.prazo_dias)
      const isProximo = periodo === e.periodos_atraso

      if (isProximo) {
        timelineItems.push({
          date: dataPeriodo,
          label: venceHoje
            ? `Vence hoje — ${formatBRL(e.valor_total_devido)}`
            : emAberto
            ? `Vence em ${formatDate(dataPeriodo)} — juros e mora em dia, falta o principal`
            : atrasado
            ? `Vence em ${formatDate(dataPeriodo)} (renova se não pago) — ${e.dias_atraso}d de atraso — ${formatBRL(e.valor_total_devido)}`
            : `Vence em ${formatDate(dataPeriodo)} — ${formatBRL(e.valor_no_vencimento)}`,
          type: 'vencimento',
        })
      } else {
        timelineItems.push({
          date: dataPeriodo,
          label: periodo === 0
            ? `Venceu em ${formatDate(dataPeriodo)} — não pago`
            : `Renovação — venceu em ${formatDate(dataPeriodo)} sem pagamento — + ${formatBRL(e.valor_juros)} de juros`,
          type: 'vencimento_passado',
        })
      }
    }
  }

  timelineItems.sort((a, b) => a.date.localeCompare(b.date))

  const dotColor = (type: TimelineItem['type']) => {
    if (type === 'criado') return 'var(--primary)'
    if (type === 'quitado') return '#00e5cc'
    if (type === 'pagamento') return 'var(--warning)'
    if (type === 'vencimento_passado') return 'var(--muted-foreground)'
    if (type === 'vencimento') {
      if ((atrasado && !emAberto) || venceHoje) return 'var(--destructive)'
      return 'var(--muted-foreground)'
    }
    return 'var(--muted-foreground)'
  }

  const dotIcon = (type: TimelineItem['type']) => {
    if (type === 'criado') return <TrendingUp className="w-3 h-3" />
    if (type === 'quitado') return <CheckCircle2 className="w-3 h-3" />
    if (type === 'pagamento') return <CreditCard className="w-3 h-3" />
    if (type === 'vencimento_passado') return <Clock className="w-3 h-3" />
    if (type === 'vencimento' && ((atrasado && !emAberto) || venceHoje)) return <AlertCircle className="w-3 h-3" />
    return <Clock className="w-3 h-3" />
  }

  const situacaoColor = emAberto
    ? 'var(--primary)'
    : atrasado
    ? 'var(--destructive)'
    : venceHoje
    ? 'var(--destructive)'
    : quitado
    ? '#00e5cc'
    : negociado
    ? '#8b5cf6'
    : 'var(--primary)'

  const situacaoLabel = emAberto
    ? 'Em aberto'
    : atrasado
    ? `Atrasado ${e.dias_atraso}d`
    : venceHoje
    ? 'Vence hoje'
    : quitado
    ? 'Quitado'
    : negociado
    ? 'Negociado'
    : 'Em dia'

  async function handleAddAnotacao() {
    const texto = novaAnotacao.trim()
    if (!texto) return
    setSavingAnotacao(true)
    await onAddAnotacao(texto)
    setNovaAnotacao('')
    setSavingAnotacao(false)
  }

  async function handleDeleteAnotacao(id: string) {
    setDeletingId(id)
    await onDeleteAnotacao(id)
    setDeletingId(null)
  }

  const anotacoesOrdenadas = [...anotacoes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div
      className={`rounded-2xl border p-4 ${borderClass}`}
      style={{ background: 'var(--card)', borderColor }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
            {formatBRL(e.valor_principal)}
            <span className="font-normal text-xs ml-1.5" style={{ color: 'var(--muted-foreground)' }}>
              {retroativo ? 'principal · sem juros/mora' : `principal · ${e.taxa_juros}% juros`}
            </span>
          </p>
          {!quitado && (
            <p className="text-lg font-bold mt-0.5" style={{ color: situacaoColor }}>
              {formatBRL(saldoDevedor)}
              <span className="text-xs font-normal ml-1.5" style={{ color: 'var(--muted-foreground)' }}>
                {totalPago > 0 ? 'saldo devedor' : 'devido hoje'}
              </span>
            </p>
          )}
          {negociado && (
            <p className="text-xs mt-0.5" style={{ color: '#8b5cf6' }}>
              {negociadoComValor
                ? 'Valor negociado manualmente — substitui o cálculo automático'
                : e.data_negociacao
                ? `Congelado em ${formatDate(e.data_negociacao)}`
                : 'Cálculo não congelado — juros e mora continuam correndo'}
            </p>
          )}
          {retroativo && !quitado && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Retroativo — sem juros ou mora
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <>
              <span className="text-xs font-medium" style={{ color: '#ff5470' }}>Excluir?</span>
              <Button
                size="sm"
                disabled={deletingEmp}
                onClick={handleDelete}
                className="h-7 px-2 text-xs font-semibold"
                style={{ background: '#ff5470', color: '#fff' }}
              >
                {deletingEmp ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deletingEmp}
                onClick={() => setConfirmDelete(false)}
                className="h-7 px-2 text-xs"
                style={{ color: 'var(--muted-foreground)' }}
              >
                Não
              </Button>
            </>
          ) : (
            <>
              <Badge
                className="text-xs"
                style={{ background: `${situacaoColor}20`, color: situacaoColor, border: 'none' }}
              >
                {atrasado && !emAberto && <AlertCircle className="w-3 h-3 mr-1" />}
                {quitado && <CheckCircle2 className="w-3 h-3 mr-1" />}
                {situacaoLabel}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="h-7 w-7 hover:bg-destructive/10"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onEdit}
                className="h-7 w-7 hover:bg-primary/10"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {!quitado && (
                <Button
                  size="sm"
                  onClick={onPagamento}
                  className="text-xs font-semibold h-7 px-3 hover:brightness-110 active:scale-95"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  Pagar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Breakdown principal / juros / mora / pago */}
      {!quitado && (
        <div className="mb-4 rounded-xl overflow-hidden text-xs" style={{ background: 'var(--muted)' }}>
          <div className="px-3 py-2.5 flex flex-col gap-1.5">
            {negociadoComValor ? (
              <div className="flex items-center gap-1.5">
                <span style={{ color: 'var(--muted-foreground)' }}>
                  Valor negociado{e.parcelas_negociado ? ` (${e.parcelas_negociado}x)` : ''}
                </span>
                <span style={{ color: '#8b5cf6', fontWeight: 500 }}>{formatBRL(e.valor_negociado ?? 0)}</span>
              </div>
            ) : retroativo ? (
              <div className="flex items-center gap-1.5">
                <span style={{ color: 'var(--muted-foreground)' }}>Principal (retroativo, sem juros/mora)</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{formatBRL(e.valor_principal)}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--muted-foreground)' }}>Principal</span>
                  <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{formatBRL(e.valor_principal)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    Juros {e.periodos_atraso > 0 ? `(${e.periodos_atraso + 1}× ${e.taxa_juros}%)` : `(${e.taxa_juros}%)`}
                  </span>
                  <span style={{ color: e.periodos_atraso > 0 ? 'var(--destructive)' : 'var(--primary)' }}>
                    + {formatBRL(e.periodos_atraso > 0 ? jurosTotal : e.valor_juros)}
                  </span>
                </div>
                {e.valor_mora > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--muted-foreground)' }}>
                      Mora ({e.dias_atraso}d × {formatBRL(e.juros_mora_diario_reais)}/d)
                    </span>
                    <span style={{ color: 'var(--destructive)' }}>+ {formatBRL(e.valor_mora)}</span>
                  </div>
                )}
              </>
            )}
            {(negociadoComValor ? pagoNegociado : totalPago) > 0 && (
              <div className="flex items-center gap-1.5">
                <span style={{ color: 'var(--muted-foreground)' }}>Já pago</span>
                <span style={{ color: '#00e5cc' }}>− {formatBRL(negociadoComValor ? pagoNegociado : pagoEfetivo)}</span>
              </div>
            )}
          </div>
          <div
            className="px-3 py-2 border-t flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', background: `${situacaoColor}12` }}
          >
            <span className="text-xs font-semibold" style={{ color: situacaoColor }}>
              {totalPago > 0 ? 'Saldo devedor' : 'Total devido'}
            </span>
            <span className="text-sm font-bold" style={{ color: situacaoColor }}>
              {formatBRL(saldoDevedor)}
            </span>
          </div>
        </div>
      )}

      {/* Contador de atraso */}
      {atrasado && !atrasoPago && (
        <div
          className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3"
          style={{
            background: 'rgba(255,84,112,0.08)',
            borderLeft: '3px solid var(--destructive)',
          }}
        >
          <span
            className="text-4xl font-bold tabular-nums leading-none"
            style={{ color: 'var(--destructive)' }}
          >
            {e.dias_atraso}
          </span>
          <span className="text-xs font-medium leading-tight" style={{ color: 'var(--destructive)' }}>
            dias<br />de atraso
          </span>
        </div>
      )}

      {/* Observações */}
      {e.observacoes && (
        <div
          className="mb-4 rounded-xl px-3 py-2.5"
          style={{ background: 'var(--muted)' }}
        >
          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Observações
          </p>
          <p className="text-xs" style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
            {e.observacoes}
          </p>
        </div>
      )}

      {/* Timeline */}
      <Accordion>
        <AccordionItem value="historico" className="border-b-0">
          <AccordionTrigger className="py-1.5 text-xs font-semibold no-underline hover:no-underline hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
            Histórico ({timelineItems.length})
          </AccordionTrigger>
          <AccordionPanel className="pb-0">
            <div className="relative pl-5 pt-1">
              <div
                className="absolute left-1.75 top-2 bottom-2 w-px"
                style={{ background: 'var(--border)' }}
              />
              {timelineItems.map((item, idx) => {
                const isLast = idx === timelineItems.length - 1
                const color = dotColor(item.type)
                const isFutureVencimento = item.type === 'vencimento' && item.date > hoje

                return (
                  <div key={idx} className={`relative flex items-start gap-3 ${isLast ? '' : 'mb-3'}`}>
                    <div
                      className="absolute -left-3.25 w-3.75 h-3.75 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10"
                      style={{
                        background: isFutureVencimento ? 'var(--muted)' : color,
                        border: isFutureVencimento ? `2px solid ${color}` : 'none',
                        color: isFutureVencimento ? color : '#040d1f',
                      }}
                    >
                      <span style={{ color: isFutureVencimento ? color : '#040d1f' }}>
                        {dotIcon(item.type)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-xs"
                        style={{
                          color: isLast && ((atrasado && !emAberto) || venceHoje) ? 'var(--destructive)' : isLast && quitado ? '#00e5cc' : 'var(--foreground)',
                          fontWeight: isLast ? 600 : 400,
                        }}
                      >
                        {item.label}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        {formatDate(item.date)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {/* Anotações */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-3">
          <MessageSquarePlus className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>
            Anotações {anotacoes.length > 0 && `(${anotacoes.length})`}
          </span>
        </div>

        {/* Input nova anotação */}
        <div className="flex gap-2 mb-3">
          <Textarea
            rows={2}
            value={novaAnotacao}
            onChange={e => setNovaAnotacao(e.target.value)}
            placeholder="Adicionar anotação..."
            className="text-xs resize-none"
            style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddAnotacao()
            }}
          />
          <Button
            size="sm"
            disabled={!novaAnotacao.trim() || savingAnotacao}
            onClick={handleAddAnotacao}
            className="self-end shrink-0 h-8 px-3 text-xs font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {savingAnotacao ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
          </Button>
        </div>

        {/* Lista de anotações */}
        {anotacoesOrdenadas.length > 0 && (
          <div className="flex flex-col gap-2">
            {anotacoesOrdenadas.map(a => (
              <div
                key={a.id}
                className="rounded-xl px-3 py-2 flex items-start gap-2 group"
                style={{ background: 'var(--muted)' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
                    {a.texto}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(a.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteAnotacao(a.id)}
                  disabled={deletingId === a.id}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                  style={{ color: 'var(--destructive)' }}
                >
                  {deletingId === a.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
