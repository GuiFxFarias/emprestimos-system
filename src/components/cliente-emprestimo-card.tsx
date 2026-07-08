'use client'

import { memo } from 'react'
import { ChevronRight, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/lib/format'
import { ClienteAvatar } from '@/components/cliente-avatar'

export interface ClienteEmprestimoStats {
  id: string
  nome: string
  telefone: string | null
  foto_url: string | null
  totalAtivo: number
  totalDevido: number
  totalJuros: number
  totalJurosFixo: number
  totalNegociado: number
  temAtrasado: boolean
  temNegociado: boolean
  temVenceHoje: boolean
  emprestimosAtivos: number
}

interface Props {
  cliente: ClienteEmprestimoStats
  onClick: () => void
}

export const ClienteEmprestimoCard = memo(function ClienteEmprestimoCard({ cliente, onClick }: Props) {
  const borderColor = cliente.temAtrasado
    ? 'var(--destructive)'
    : cliente.temVenceHoje
    ? 'var(--destructive)'
    : 'var(--border)'

  const statusBadge = cliente.temAtrasado ? (
    <Badge className="text-xs" style={{ background: 'rgba(255,84,112,0.15)', color: 'var(--destructive)', border: 'none' }}>
      <AlertCircle className="w-3 h-3 mr-1" />
      Em atraso
    </Badge>
  ) : cliente.temVenceHoje ? (
    <Badge className="text-xs" style={{ background: 'rgba(255,84,112,0.15)', color: 'var(--destructive)', border: 'none' }}>
      Vence hoje
    </Badge>
  ) : cliente.emprestimosAtivos > 0 ? (
    <Badge className="text-xs" style={{ background: 'rgba(0,198,255,0.15)', color: 'var(--primary)', border: 'none' }}>
      {cliente.emprestimosAtivos} ativo{cliente.emprestimosAtivos > 1 ? 's' : ''}
    </Badge>
  ) : null

  const negociadoBadge = cliente.temNegociado ? (
    <Badge className="text-xs" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: 'none' }}>
      Negociado
    </Badge>
  ) : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition-all duration-150 hover:border-primary/40 hover:brightness-110 active:scale-[0.99]"
      style={{
        background: 'var(--card)',
        borderColor,
        ...(cliente.temAtrasado ? { borderWidth: '1.5px' } : {}),
      }}
    >
      <ClienteAvatar fotoPath={cliente.foto_url} nome={cliente.nome} size={40} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
            {cliente.nome}
          </span>
          {statusBadge}
          {negociadoBadge}
        </div>
        {cliente.emprestimosAtivos > 0 ? (
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Total emprestado:{' '}
            <span className="font-medium" style={{ color: cliente.temAtrasado ? 'var(--destructive)' : '#00e5cc' }}>
              {formatBRL(cliente.totalDevido)}
            </span>
            {' · '}Juros a receber:{' '}
            <span className="font-medium" style={{ color: cliente.temAtrasado ? 'var(--destructive)' : '#00e5cc' }}>
              {formatBRL(cliente.totalJuros)}
            </span>
            {' · '}Juros Fixos:{' '}
            <span className="font-medium" style={{ color: '#00e5cc' }}>
              {formatBRL(cliente.totalJurosFixo)}
            </span>
            {cliente.totalNegociado > 0 && (
              <>
                {' · '}Negociado:{' '}
                <span className="font-medium" style={{ color: '#8b5cf6' }}>
                  {formatBRL(cliente.totalNegociado)}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Sem empréstimos ativos</p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
    </button>
  )
})
