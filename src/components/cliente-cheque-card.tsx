'use client'

import { memo } from 'react'
import { ChevronRight, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/lib/format'
import { ClienteAvatar } from '@/components/cliente-avatar'
import { SITUACAO_CHEQUE_INFO, type SituacaoCheque } from '@/lib/cheques'

export interface ClienteChequeStats {
  id: string
  nome: string
  telefone: string | null
  foto_url: string | null
  aReceber: number
  juros: number
  entregue: number
  abertos: number
  compensados: number
  // situação mais urgente entre os cheques em aberto (null = nenhum aberto)
  pior: SituacaoCheque | null
}

interface Props {
  cliente: ClienteChequeStats
  onClick: () => void
}

export const ClienteChequeCard = memo(function ClienteChequeCard({ cliente, onClick }: Props) {
  const info = cliente.pior ? SITUACAO_CHEQUE_INFO[cliente.pior] : null
  const urgente = info?.urgente ?? false

  const statusBadge = info && urgente ? (
    <Badge className="text-xs" style={{ background: `color-mix(in srgb, ${info.color} 15%, transparent)`, color: info.color, border: 'none' }}>
      {cliente.pior !== 'vence_em_breve' && <AlertCircle className="w-3 h-3 mr-1" />}
      {info.label}
    </Badge>
  ) : cliente.abertos > 0 ? (
    <Badge className="text-xs" style={{ background: 'rgba(0,198,255,0.15)', color: 'var(--primary)', border: 'none' }}>
      {cliente.abertos} em aberto
    </Badge>
  ) : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition-all duration-150 hover:border-primary/40 hover:brightness-110 active:scale-[0.99]"
      style={{
        background: 'var(--card)',
        borderColor: info && urgente ? `color-mix(in srgb, ${info.color} 50%, transparent)` : 'var(--border)',
      }}
    >
      <ClienteAvatar fotoPath={cliente.foto_url} nome={cliente.nome} size={40} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
            {cliente.nome}
          </span>
          {statusBadge}
          {urgente && cliente.abertos > 1 && (
            <Badge className="text-xs" style={{ background: 'rgba(0,198,255,0.15)', color: 'var(--primary)', border: 'none' }}>
              {cliente.abertos} em aberto
            </Badge>
          )}
        </div>
        {cliente.abertos > 0 ? (
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            A receber:{' '}
            <span className="font-medium" style={{ color: '#00e5cc' }}>{formatBRL(cliente.aReceber)}</span>
            {' · '}Juros:{' '}
            <span className="font-medium" style={{ color: 'var(--primary)' }}>{formatBRL(cliente.juros)}</span>
            {' · '}Entregue:{' '}
            <span className="font-medium" style={{ color: 'var(--foreground)' }}>{formatBRL(cliente.entregue)}</span>
          </p>
        ) : (
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Nenhum cheque em aberto
            {cliente.compensados > 0 && ` · ${cliente.compensados} compensado${cliente.compensados !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
    </button>
  )
})
