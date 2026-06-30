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
import { formatBRL } from '@/lib/format'
import type { EmprestimoCalculado } from '@/lib/types'

type Destino = 'atraso' | 'juros' | 'principal' | 'quitacao'

const schema = z.object({
  destino: z.enum(['atraso', 'juros', 'principal', 'quitacao']),
  valor: z.number().min(0.01, 'Valor obrigatório'),
  data_pagamento: z.string().min(1, 'Data obrigatória'),
  observacoes: z.string().optional(),
})

export type PagamentoFormValues = z.infer<typeof schema>

function getMax(destino: Destino, emp: EmprestimoCalculado): number {
  switch (destino) {
    case 'atraso': return emp.valor_mora
    case 'juros': return Number((emp.valor_juros * (1 + emp.periodos_atraso)).toFixed(2))
    case 'principal': return emp.valor_principal
    case 'quitacao': return emp.valor_total_devido
  }
}

interface Props {
  emprestimo: EmprestimoCalculado | null
  onClose: () => void
  onSubmit: (values: PagamentoFormValues) => Promise<void>
  saving: boolean
}

export function PagamentoDialog({ emprestimo, onClose, onSubmit, saving }: Props) {
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
    setDestino('quitacao')
    form.reset({
      destino: 'quitacao',
      valor: emprestimo.valor_total_devido,
      data_pagamento: new Date().toISOString().slice(0, 10),
      observacoes: '',
    })
  }, [emprestimo?.id])

  if (!emprestimo) return null

  const maxValor = getMax(destino, emprestimo)
  const isQuitacao = destino === 'quitacao'
  const temAtraso = emprestimo.dias_atraso > 0 && emprestimo.valor_mora > 0
  const jurosTotal = Number((emprestimo.valor_juros * (1 + emprestimo.periodos_atraso)).toFixed(2))

  function handleDestinoChange(newDestino: Destino) {
    setDestino(newDestino)
    form.setValue('destino', newDestino)
    form.setValue('valor', getMax(newDestino, emprestimo!))
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
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)' }}>Resumo da dívida</p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span style={rowStyle}>Principal</span>
              <span style={{ color: 'var(--foreground)' }}>{formatBRL(emprestimo.valor_principal)}</span>
            </div>
            {jurosTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span style={rowStyle}>
                  Juros{emprestimo.periodos_atraso > 0 ? ` (${1 + emprestimo.periodos_atraso}× ${emprestimo.taxa_juros}%)` : ` (${emprestimo.taxa_juros}%)`}
                </span>
                <span style={{ color: 'var(--foreground)' }}>{formatBRL(jurosTotal)}</span>
              </div>
            )}
            {temAtraso && (
              <div className="flex justify-between text-sm">
                <span style={{ color: '#ff5470' }}>
                  Mora ({emprestimo.dias_atraso} dia{emprestimo.dias_atraso > 1 ? 's' : ''})
                </span>
                <span style={{ color: '#ff5470' }}>{formatBRL(emprestimo.valor_mora)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-sm font-bold border-t mt-1 pt-1.5"
              style={{ borderColor: 'rgba(0,229,204,0.2)' }}
            >
              <span style={{ color: 'var(--foreground)' }}>Total devido</span>
              <span style={{ color: '#00e5cc' }}>{formatBRL(emprestimo.valor_total_devido)}</span>
            </div>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label style={rowStyle}>Destinação do pagamento</Label>
            <select
              value={destino}
              onChange={e => handleDestinoChange(e.target.value as Destino)}
              className="w-full rounded-lg px-3 py-2 text-sm border appearance-none"
              style={inputStyle}
            >
              <option value="quitacao">Quitação total — {formatBRL(emprestimo.valor_total_devido)}</option>
              <option value="principal">Principal (dívida) — {formatBRL(emprestimo.valor_principal)}</option>
              {jurosTotal > 0 && (
                <option value="juros">Juros — {formatBRL(jurosTotal)}</option>
              )}
              {temAtraso && (
                <option value="atraso">
                  Mora / Atraso ({emprestimo.dias_atraso} dia{emprestimo.dias_atraso > 1 ? 's' : ''}) — {formatBRL(emprestimo.valor_mora)}
                </option>
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label style={rowStyle}>Valor pago (R$)</Label>
              <span className="text-xs" style={rowStyle}>Máx: {formatBRL(maxValor)}</span>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              readOnly={isQuitacao}
              style={{
                ...inputStyle,
                ...(isQuitacao ? { background: 'var(--muted)', cursor: 'not-allowed', opacity: 0.8 } : {}),
              }}
              {...form.register('valor', {
                valueAsNumber: true,
                validate: v => {
                  const max = getMax(form.getValues('destino') as Destino, emprestimo)
                  return v <= max + 0.005 || `Máximo para este tipo: ${formatBRL(max)}`
                },
              })}
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
