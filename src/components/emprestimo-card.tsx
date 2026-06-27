'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'
import { formatBRL, formatDate } from '@/lib/format'
import type { EmprestimoCalculado } from '@/lib/types'

interface Props {
  e: EmprestimoCalculado
  onPagamento: () => void
}

export const EmprestimoCard = memo(function EmprestimoCard({ e, onPagamento }: Props) {
  const situacaoColor =
    e.situacao === 'atrasado' ? 'var(--destructive)' :
    e.situacao === 'quitado' ? '#00e5cc' :
    'var(--primary)'

  const situacaoLabel =
    e.situacao === 'atrasado' ? 'Atrasado' :
    e.situacao === 'quitado' ? 'Quitado' :
    'Em dia'

  return (
    <div
      className="rounded-2xl border p-4 flex flex-col gap-3"
      style={{
        background: 'var(--card)',
        borderColor: e.situacao === 'atrasado' ? 'rgba(255,84,112,0.3)' : 'var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{e.cliente_nome}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Principal: {formatBRL(e.valor_principal)} · Juros: {e.taxa_juros}%
          </p>
        </div>
        <Badge
          className="text-xs shrink-0"
          style={{ background: `${situacaoColor}20`, color: situacaoColor, border: 'none' }}
        >
          {e.situacao === 'atrasado' && <AlertCircle className="w-3 h-3 mr-1" />}
          {e.situacao === 'quitado' && <CheckCircle2 className="w-3 h-3 mr-1" />}
          {situacaoLabel}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <Calendar className="w-3 h-3 inline mr-1" />
            Vence {formatDate(e.data_vencimento)}
            {e.dias_atraso > 0 && (
              <span className="ml-1" style={{ color: 'var(--destructive)' }}>
                ({e.dias_atraso}d atraso)
              </span>
            )}
          </p>
          {e.situacao !== 'quitado' ? (
            <p className="text-lg font-bold mt-0.5" style={{ color: e.situacao === 'atrasado' ? 'var(--destructive)' : '#00e5cc' }}>
              {formatBRL(e.valor_total_devido)}
            </p>
          ) : (
            <p className="text-sm mt-0.5" style={{ color: '#00e5cc' }}>
              Quitado em {formatDate(e.data_quitacao!)} · {formatBRL(e.valor_quitado!)}
            </p>
          )}
        </div>
        {e.situacao !== 'quitado' && (
          <Button
            size="sm"
            onClick={onPagamento}
            className="font-semibold text-xs"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            Pagamento
          </Button>
        )}
      </div>
    </div>
  )
})
