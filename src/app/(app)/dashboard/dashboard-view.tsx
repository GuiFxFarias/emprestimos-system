'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { queryKeys, fetchEmprestimosCalculados, fetchAllPagamentos, fetchCheques, type PagamentoResumo } from '@/lib/queries'
import { formatBRL, formatDate } from '@/lib/format'
import { composicaoNegociado, separarRecebido } from '@/lib/recebimentos'
import {
  hojeLocal,
  jurosCheque,
  entregueCheque,
  diasParaVencer,
  situacaoCheque,
  SITUACAO_CHEQUE_INFO,
  type SituacaoCheque,
} from '@/lib/cheques'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/metric-card'
import { addDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  TrendingUp,
  Wallet,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Calendar,
  Handshake,
  PiggyBank,
  Receipt,
} from 'lucide-react'
import type { EmprestimoCalculado, ChequeComCliente } from '@/lib/types'
import Link from 'next/link'

const DonutChart = dynamic(
  () => import('@/components/dashboard-charts').then(m => m.DonutChart),
  { ssr: false, loading: () => <Skeleton className="h-24 w-full rounded-xl" style={{ background: 'var(--muted)' }} /> }
)

const BarChartMensal = dynamic(
  () => import('@/components/dashboard-charts').then(m => m.BarChartMensal),
  { ssr: false, loading: () => <Skeleton className="h-24 w-full rounded-xl" style={{ background: 'var(--muted)' }} /> }
)

export function DashboardView({
  initialEmprestimos,
  initialPagamentos,
  initialCheques,
}: {
  initialEmprestimos: EmprestimoCalculado[]
  initialPagamentos: PagamentoResumo[]
  initialCheques: ChequeComCliente[]
}) {
  const hoje = hojeLocal()

  const { data: emprestimos = [], isLoading } = useQuery({
    queryKey: queryKeys.emprestimosCalculados(),
    queryFn: fetchEmprestimosCalculados,
    initialData: initialEmprestimos,
  })

  const { data: pagamentos = [] } = useQuery({
    queryKey: queryKeys.pagamentos(),
    queryFn: fetchAllPagamentos,
    initialData: initialPagamentos,
  })

  const { data: cheques = [] } = useQuery({
    queryKey: queryKeys.cheques(),
    queryFn: fetchCheques,
    initialData: initialCheques,
  })

  const chequesAbertos = useMemo(() => cheques.filter(c => c.status !== 'compensado'), [cheques])

  const { ativos, quitados, atrasados, negociados } = useMemo(() => ({
    ativos: emprestimos.filter(e => e.status === 'ativo' || e.status === 'negociado'),
    quitados: emprestimos.filter(e => e.status === 'quitado'),
    atrasados: emprestimos.filter(e => e.situacao === 'atrasado'),
    negociados: emprestimos.filter(e => e.situacao === 'negociado'),
  }), [emprestimos])

  // Soma de pagamentos já registrados, por empréstimo (total, só juros e só quitação)
  const pagosPorEmp = useMemo(() => {
    const map: Record<string, { total: number; juros: number; quitacao: number }> = {}
    for (const p of pagamentos) {
      if (!map[p.emprestimo_id]) map[p.emprestimo_id] = { total: 0, juros: 0, quitacao: 0 }
      map[p.emprestimo_id].total += p.valor
      if (p.destino === 'juros') map[p.emprestimo_id].juros += p.valor
      if (p.destino === 'quitacao') map[p.emprestimo_id].quitacao += p.valor
    }
    return map
  }, [pagamentos])

  const pagamentosPorEmp = useMemo(() => {
    const map: Record<string, PagamentoResumo[]> = {}
    for (const p of pagamentos) (map[p.emprestimo_id] ??= []).push(p)
    return map
  }, [pagamentos])

  const metrics = useMemo(() => {
    // Recebido separado em juros (lucro) e capital (volta pro caixa):
    // pagamentos dos empréstimos + cheques já compensados
    let recebidoJuros = 0
    let recebidoCapital = 0
    for (const e of emprestimos) {
      const r = separarRecebido(e, pagamentosPorEmp[e.id] ?? [])
      recebidoJuros += r.juros
      recebidoCapital += r.capital
    }
    for (const c of cheques) {
      if (c.status !== 'compensado') continue
      recebidoJuros += jurosCheque(c)
      recebidoCapital += entregueCheque(c)
    }

    // Negociado: o que falta receber + composição (capital × juros) dos acordos
    let negCapital = 0
    let negJuros = 0
    let negPago = 0
    let negRestante = 0
    for (const e of negociados) {
      const pags = pagamentosPorEmp[e.id] ?? []
      if (e.valor_negociado != null) {
        // acordo à parte: só o que foi pago como "quitação" do acordo abate
        const comp = composicaoNegociado(e, pags)
        const pago = pagosPorEmp[e.id]?.quitacao ?? 0
        negCapital += comp.capital
        negJuros += comp.juros
        negPago += pago
        negRestante += Math.max(0, comp.total - pago)
      } else {
        const pago = pagosPorEmp[e.id]?.total ?? 0
        negCapital += e.valor_principal
        negJuros += Math.max(0, e.valor_total_devido - e.valor_principal)
        negPago += pago
        negRestante += Math.max(0, e.valor_total_devido - pago)
      }
    }

    const chequesCapital = chequesAbertos.reduce((s, c) => s + entregueCheque(c), 0)
    const chequesJuros = chequesAbertos.reduce((s, c) => s + jurosCheque(c), 0)
    const chequesUrgentes = chequesAbertos.filter(c => SITUACAO_CHEQUE_INFO[situacaoCheque(c, hoje)].urgente).length

    // Juros ainda não pagos: vai pra "a receber" enquanto o empréstimo está
    // em dia (ainda não venceu), e pra "em atraso" assim que a situação
    // (que já considera os pagamentos de juros feitos) vira 'atrasado'.
    let jurosAReceber = 0
    let jurosEmAtraso = 0
    let jurosFixos = 0
    for (const e of ativos) {
      if (e.status === 'negociado') continue // contabilizado no card "Negociado"
      const jurosTotal = e.valor_juros * (1 + e.periodos_atraso)
      const pagoJuros = pagosPorEmp[e.id]?.juros ?? 0
      const restante = Math.max(0, jurosTotal - pagoJuros)
      if (e.situacao === 'atrasado') {
        jurosEmAtraso += restante
      } else {
        jurosAReceber += restante
      }
      // Juros fixo: valor do juro calculado sobre o emprestado, independente
      // de ter gerado (períodos de atraso) ou sido pago
      jurosFixos += e.valor_juros
    }

    return [
      {
        label: 'Capital ativo',
        value: formatBRL(ativos.reduce((s, e) => s + e.valor_principal, 0)),
        icon: <Wallet className="w-5 h-5" />,
        color: 'var(--primary)',
      },
      {
        label: 'Carteira a receber',
        value: formatBRL(ativos.reduce((s, e) => s + e.valor_no_vencimento, 0)),
        icon: <TrendingUp className="w-5 h-5" />,
        color: '#00e5cc',
      },
      {
        label: 'Juros a receber',
        value: formatBRL(jurosAReceber),
        icon: <DollarSign className="w-5 h-5" />,
        color: '#00e5cc',
      },
      {
        label: 'Juros Fixos',
        value: formatBRL(jurosFixos),
        icon: <DollarSign className="w-5 h-5" />,
        color: '#00e5cc',
      },
      {
        label: 'Em atraso',
        value: formatBRL(jurosEmAtraso),
        sub: `${atrasados.length} empréstimo${atrasados.length !== 1 ? 's' : ''}`,
        icon: <AlertCircle className="w-5 h-5" />,
        color: 'var(--destructive)',
      },
      {
        label: 'Negociado',
        value: formatBRL(negRestante),
        details: negociados.length > 0
          ? [
              { label: 'Valor emprestado', value: formatBRL(negCapital) },
              { label: 'Juros', value: formatBRL(negJuros) },
              { label: 'Total negociado', value: formatBRL(negCapital + negJuros) },
              ...(negPago > 0 ? [{ label: 'Já pago', value: `− ${formatBRL(negPago)}` }] : []),
            ]
          : undefined,
        sub: `falta receber · ${negociados.length} empréstimo${negociados.length !== 1 ? 's' : ''}`,
        icon: <Handshake className="w-5 h-5" />,
        color: '#8b5cf6',
      },
      {
        label: 'Juros recebidos (lucro)',
        value: formatBRL(recebidoJuros),
        sub: `de ${formatBRL(recebidoJuros + recebidoCapital)} recebidos no total`,
        icon: <CheckCircle2 className="w-5 h-5" />,
        color: '#00e5cc',
      },
      {
        label: 'Capital devolvido ao caixa',
        value: formatBRL(recebidoCapital),
        sub: 'valor emprestado que já voltou',
        icon: <PiggyBank className="w-5 h-5" />,
        color: 'var(--primary)',
      },
      {
        label: 'Cheques a compensar',
        value: formatBRL(chequesCapital + chequesJuros),
        details: chequesAbertos.length > 0
          ? [
              { label: 'Valor entregue', value: formatBRL(chequesCapital) },
              { label: 'Juros', value: formatBRL(chequesJuros) },
            ]
          : undefined,
        sub: `${chequesAbertos.length} cheque${chequesAbertos.length !== 1 ? 's' : ''}`
          + (chequesUrgentes > 0 ? ` · ${chequesUrgentes} precisa${chequesUrgentes !== 1 ? 'm' : ''} de atenção` : ''),
        icon: <Receipt className="w-5 h-5" />,
        color: chequesUrgentes > 0 ? 'var(--destructive)' : 'var(--primary)',
      },
    ]
  }, [emprestimos, ativos, atrasados, negociados, cheques, chequesAbertos, hoje, pagosPorEmp, pagamentosPorEmp])

  const donutData = useMemo(() => [
    { name: 'Em dia', value: ativos.filter(e => e.situacao === 'em_dia').length, color: 'var(--primary)' },
    { name: 'Atrasado', value: atrasados.length, color: 'var(--destructive)' },
    { name: 'Negociado', value: negociados.length, color: '#8b5cf6' },
    { name: 'Quitado', value: quitados.length, color: '#00e5cc' },
  ].filter(d => d.value > 0), [ativos, atrasados, negociados, quitados])

  const barData = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const e of emprestimos) {
      const key = format(parseISO(e.data_emprestimo), 'MMM/yy', { locale: ptBR })
      grouped[key] = (grouped[key] ?? 0) + e.valor_principal
    }
    return Object.entries(grouped).map(([mes, total]) => ({ mes, total })).slice(-6)
  }, [emprestimos])

  const urgentes = useMemo(() => {
    const em7dias = format(addDays(parseISO(hoje), 7), 'yyyy-MM-dd')
    const proxVencimentos = ativos
      .filter(e => e.situacao === 'em_dia' && e.data_vencimento >= hoje && e.data_vencimento <= em7dias)
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    // cheque só entra aqui perto do vencimento (ou vencido/devolvido) —
    // antes disso não gera alerta nenhum
    const chequesAlerta = chequesAbertos
      .map(c => ({ c, situacao: situacaoCheque(c, hoje) }))
      .filter(x => SITUACAO_CHEQUE_INFO[x.situacao].urgente)
    const chequesCriticos = chequesAlerta
      .filter(x => x.situacao !== 'vence_em_breve')
      .sort((a, b) => a.c.data_vencimento.localeCompare(b.c.data_vencimento))

    type Item = { kind: 'emp'; e: EmprestimoCalculado } | { kind: 'cheque'; c: ChequeComCliente; situacao: SituacaoCheque }
    const proximos: Item[] = [
      ...proxVencimentos.map(e => ({ kind: 'emp' as const, e })),
      ...chequesAlerta.filter(x => x.situacao === 'vence_em_breve').map(x => ({ kind: 'cheque' as const, ...x })),
    ].sort((a, b) =>
      (a.kind === 'emp' ? a.e.data_vencimento : a.c.data_vencimento)
        .localeCompare(b.kind === 'emp' ? b.e.data_vencimento : b.c.data_vencimento)
    )

    const itens: Item[] = [
      ...atrasados.sort((a, b) => b.dias_atraso - a.dias_atraso).map(e => ({ kind: 'emp' as const, e })),
      ...chequesCriticos.map(x => ({ kind: 'cheque' as const, ...x })),
      ...proximos,
    ]
    return itens.slice(0, 10)
  }, [ativos, atrasados, chequesAbertos, hoje])

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-6 h-6" style={{ color: 'var(--primary)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Dashboard</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {metrics.map(m => <MetricCard key={m.label} {...m} />)}
        </div>
      )}

      {!isLoading && emprestimos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Distribuição por situação</h3>
            <DonutChart data={donutData} />
          </div>

          <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Capital emprestado por mês</h3>
            <BarChartMensal data={barData} />
          </div>
        </div>
      )}

      {!isLoading && urgentes.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Atenção imediata</h3>
          <div className="flex flex-col gap-2">
            {urgentes.map(item => {
              if (item.kind === 'cheque') {
                return <ChequeUrgenciaItem key={`cheque-${item.c.id}`} c={item.c} situacao={item.situacao} hoje={hoje} />
              }
              const e = item.e
              const jurosTotal = e.valor_juros * (1 + e.periodos_atraso)
              const pagoJuros = pagosPorEmp[e.id]?.juros ?? 0
              const jurosRestante = Math.max(0, jurosTotal - pagoJuros)
              return <UrgenciaItem key={e.id} e={e} jurosRestante={jurosRestante} />
            })}
          </div>
        </div>
      )}

      {!isLoading && emprestimos.length === 0 && cheques.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <TrendingUp className="w-12 h-12" style={{ color: 'var(--muted-foreground)' }} />
          <p style={{ color: 'var(--muted-foreground)' }}>Nenhum dado ainda</p>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Comece cadastrando clientes e empréstimos
          </p>
        </div>
      )}
    </div>
  )
}

function UrgenciaItem({ e, jurosRestante }: { e: EmprestimoCalculado; jurosRestante: number }) {
  return (
    <Link
      href="/emprestimos"
      className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-150 hover:brightness-125 active:scale-[0.99]"
      style={{ background: 'var(--muted)' }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{e.cliente_nome}</p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          <Calendar className="w-3 h-3 inline mr-1" />
          {e.dias_atraso > 0 ? `${e.dias_atraso}d de atraso` : `Vence ${formatDate(e.data_vencimento)}`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold" style={{ color: e.situacao === 'atrasado' ? 'var(--destructive)' : '#00e5cc' }}>
          {formatBRL(jurosRestante)}
        </p>
        <Badge
          className="text-xs mt-0.5"
          style={{
            background: e.situacao === 'atrasado' ? 'rgba(255,84,112,0.15)' : 'rgba(0,198,255,0.15)',
            color: e.situacao === 'atrasado' ? 'var(--destructive)' : 'var(--primary)',
            border: 'none',
          }}
        >
          {e.situacao === 'atrasado' ? 'Atrasado' : 'Vence em breve'}
        </Badge>
      </div>
    </Link>
  )
}

function ChequeUrgenciaItem({ c, situacao, hoje }: { c: ChequeComCliente; situacao: SituacaoCheque; hoje: string }) {
  const info = SITUACAO_CHEQUE_INFO[situacao]
  const dias = diasParaVencer(c, hoje)
  const quando = situacao === 'devolvido'
    ? `Cheque devolvido · venceu ${formatDate(c.data_vencimento)}`
    : dias < 0
    ? `Cheque vencido há ${-dias}d`
    : dias === 0
    ? 'Cheque vence hoje'
    : `Cheque vence ${formatDate(c.data_vencimento)}`

  return (
    <Link
      href="/cheques"
      className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-150 hover:brightness-125 active:scale-[0.99]"
      style={{ background: 'var(--muted)' }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{c.cliente?.nome ?? 'Cheque'}</p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          <Receipt className="w-3 h-3 inline mr-1" />
          {quando}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold" style={{ color: info.color }}>{formatBRL(c.valor)}</p>
        <Badge
          className="text-xs mt-0.5"
          style={{ background: `color-mix(in srgb, ${info.color} 15%, transparent)`, color: info.color, border: 'none' }}
        >
          {info.label}
        </Badge>
      </div>
    </Link>
  )
}
