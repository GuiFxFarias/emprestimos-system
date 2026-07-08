'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatBRL } from '@/lib/format'
import type { EmprestimoCalculado, Pagamento } from '@/lib/types'

type Destino = 'atraso' | 'juros' | 'principal' | 'quitacao'

const schema = z.object({
  destino: z.enum(['atraso', 'juros', 'principal', 'quitacao']),
  valor: z.number().min(0.01, 'Valor obrigatório'),
  data_pagamento: z.string().min(1, 'Data obrigatória'),
  observacoes: z.string().optional(),
})

export type PagamentoFormValues = z.infer<typeof schema>

function somarPorDestino(pagamentos: Pagamento[], destino: Destino): number {
  return pagamentos
    .filter(p => p.destino === destino)
    .reduce((s, p) => s + p.valor, 0)
}

interface Restantes {
  principal: number
  juros: number
  atraso: number
  total: number
  pagoJuros: number
  pagoAtraso: number
  pagoPrincipal: number
}

function calcularRestantes(emp: EmprestimoCalculado, pagamentos: Pagamento[]): Restantes {
  const jurosTotal = Number((emp.valor_juros * (1 + emp.periodos_atraso)).toFixed(2))
  const pagoJuros = somarPorDestino(pagamentos, 'juros')
  const pagoAtraso = somarPorDestino(pagamentos, 'atraso')
  const pagoPrincipal = somarPorDestino(pagamentos, 'principal')

  const principal = Math.max(0, Number((emp.valor_principal - pagoPrincipal).toFixed(2)))
  const juros = Math.max(0, Number((jurosTotal - pagoJuros).toFixed(2)))
  const atraso = Math.max(0, Number((emp.valor_mora - pagoAtraso).toFixed(2)))

  // Negociado com valor manual: o total é o valor negociado, não a soma de
  // principal/juros/mora (esses continuam calculados por baixo, mas o acordo
  // manual tem prioridade — igual o valor_total_devido da view).
  const negociadoComValor = emp.status === 'negociado' && emp.valor_negociado != null
  const total = negociadoComValor
    ? Math.max(0, Number((emp.valor_negociado! - (pagoJuros + pagoAtraso + pagoPrincipal)).toFixed(2)))
    // soma dos restantes por categoria: pagar a mais numa categoria (ex.: 3000
    // de juros quando só 1800 é devido) não abate o que falta nas outras
    : Math.round((principal + juros + atraso) * 100) / 100

  return {
    principal,
    juros,
    atraso,
    total,
    pagoJuros,
    pagoAtraso,
    pagoPrincipal,
  }
}

interface Props {
  emprestimo: EmprestimoCalculado | null
  pagamentos: Pagamento[]
  onClose: () => void
  onSubmit: (values: PagamentoFormValues) => Promise<void>
  saving: boolean
}

export function PagamentoDialog({ emprestimo, pagamentos, onClose, onSubmit, saving }: Props) {
  const [destino, setDestino] = useState<Destino>('quitacao')

  const form = useForm<PagamentoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      destino: 'quitacao',
      valor: emprestimo?.valor_total_devido ?? 0,
      data_pagamento: new Date().toISOString().slice(0, 10),
      observacoes: '',
    },
  })

  useEffect(() => {
    if (!emprestimo) return
    const r = calcularRestantes(emprestimo, pagamentos)
    setDestino('quitacao')
    form.reset({
      destino: 'quitacao',
      valor: r.total,
      data_pagamento: new Date().toISOString().slice(0, 10),
      observacoes: '',
    })
  }, [emprestimo?.id])

  if (!emprestimo) return null

  const r = calcularRestantes(emprestimo, pagamentos)
  const jurosTotal = Number((emprestimo.valor_juros * (1 + emprestimo.periodos_atraso)).toFixed(2))

  function getRestante(d: Destino): number {
    switch (d) {
      case 'atraso': return r.atraso
      case 'juros': return r.juros
      case 'principal': return r.principal
      case 'quitacao': return r.total
    }
  }

  const maxValor = getRestante(destino)
  const isQuitacao = destino === 'quitacao'
  const temAtraso = emprestimo.dias_atraso > 0 && emprestimo.valor_mora > 0

  function handleDestinoChange(newDestino: Destino) {
    setDestino(newDestino)
    form.setValue('destino', newDestino)
    form.setValue('valor', getRestante(newDestino))
    form.clearErrors('valor')
  }

  const rowStyle = { color: 'var(--muted-foreground)' }
  const inputStyle = { background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }

  return (
    <Dialog open={!!emprestimo} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>
            Registrar pagamento — {emprestimo.cliente_nome}
          </DialogTitle>
        </DialogHeader>

        {/* Breakdown */}
        <div className="rounded-xl p-3 border" style={{ background: 'rgba(0,229,204,0.05)', borderColor: 'rgba(0,229,204,0.2)' }}>
          <p className="text-xs font-semibold mb-2" style={rowStyle}>Resumo da dívida</p>
          <div className="flex flex-col gap-1">

            <BreakdownRow
              label="Principal"
              total={emprestimo.valor_principal}
              pago={r.pagoPrincipal}
              restante={r.principal}
            />

            {jurosTotal > 0 && (
              <BreakdownRow
                label={emprestimo.periodos_atraso > 0
                  ? `Juros (${1 + emprestimo.periodos_atraso}× ${emprestimo.taxa_juros}%)`
                  : `Juros (${emprestimo.taxa_juros}%)`}
                total={jurosTotal}
                pago={r.pagoJuros}
                restante={r.juros}
              />
            )}

            {temAtraso && (
              <BreakdownRow
                label={`Mora (${emprestimo.dias_atraso} dia${emprestimo.dias_atraso > 1 ? 's' : ''})`}
                total={emprestimo.valor_mora}
                pago={r.pagoAtraso}
                restante={r.atraso}
                danger
              />
            )}

            <div
              className="flex justify-between text-sm font-bold border-t mt-1 pt-1.5"
              style={{ borderColor: 'rgba(0,229,204,0.2)' }}
            >
              <span style={{ color: 'var(--foreground)' }}>
                {r.total < emprestimo.valor_total_devido ? 'Restante' : 'Total devido'}
              </span>
              <span style={{ color: '#00e5cc' }}>{formatBRL(r.total)}</span>
            </div>

          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label style={rowStyle}>Destinação do pagamento</Label>
            <Select
              items={[
                { value: 'quitacao', label: `Quitação total — ${formatBRL(r.total)}` },
                ...(r.principal > 0 ? [{ value: 'principal', label: `Principal (dívida) — ${formatBRL(r.principal)}` }] : []),
                ...(r.juros > 0 ? [{ value: 'juros', label: `Juros — ${formatBRL(r.juros)}` }] : []),
                ...(temAtraso && r.atraso > 0 ? [{ value: 'atraso', label: `Mora / Atraso (${emprestimo.dias_atraso} dia${emprestimo.dias_atraso > 1 ? 's' : ''}) — ${formatBRL(r.atraso)}` }] : []),
              ]}
              value={destino}
              onValueChange={v => handleDestinoChange(v as Destino)}
            >
              <SelectTrigger className="w-full" style={inputStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quitacao">Quitação total — {formatBRL(r.total)}</SelectItem>
                {r.principal > 0 && (
                  <SelectItem value="principal">Principal (dívida) — {formatBRL(r.principal)}</SelectItem>
                )}
                {r.juros > 0 && (
                  <SelectItem value="juros">Juros — {formatBRL(r.juros)}</SelectItem>
                )}
                {temAtraso && r.atraso > 0 && (
                  <SelectItem value="atraso">
                    Mora / Atraso ({emprestimo.dias_atraso} dia{emprestimo.dias_atraso > 1 ? 's' : ''}) — {formatBRL(r.atraso)}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label style={rowStyle}>Valor pago (R$)</Label>
              <span className="text-xs" style={rowStyle}>Sugerido: {formatBRL(maxValor)}</span>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              style={inputStyle}
              {...form.register('valor', { valueAsNumber: true })}
            />
            {form.formState.errors.valor && (
              <p className="text-xs" style={{ color: '#ff5470' }}>
                {form.formState.errors.valor.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={rowStyle}>Data do pagamento</Label>
            <Input type="date" {...form.register('data_pagamento')} style={inputStyle} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={rowStyle}>Observações</Label>
            <Textarea
              rows={2}
              placeholder="Alguma anotação sobre este pagamento..."
              {...form.register('observacoes')}
              style={inputStyle}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              style={{
                background: isQuitacao ? '#00e5cc' : 'var(--primary)',
                color: isQuitacao ? '#040d1f' : 'var(--primary-foreground)',
              }}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isQuitacao ? 'Quitar empréstimo' : 'Confirmar pagamento'
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface BreakdownRowProps {
  label: string
  total: number
  pago: number
  restante: number
  danger?: boolean
}

function BreakdownRow({ label, total, pago, restante, danger }: BreakdownRowProps) {
  const baseColor = danger ? '#ff5470' : 'var(--foreground)'
  const temParcial = pago > 0

  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        {temParcial && (
          <span className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>
            {formatBRL(total)}
          </span>
        )}
        <span style={{ color: baseColor }}>{formatBRL(restante)}</span>
      </div>
    </div>
  )
}
