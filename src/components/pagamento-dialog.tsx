'use client'

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

const schema = z.object({
  valor: z.number().min(0.01, 'Valor obrigatório'),
  data_pagamento: z.string().min(1),
  tipo: z.enum(['parcial', 'quitacao']),
  observacoes: z.string().optional(),
})

export type PagamentoFormValues = z.infer<typeof schema>

interface Props {
  emprestimo: EmprestimoCalculado | null
  onClose: () => void
  onSubmit: (values: PagamentoFormValues) => Promise<void>
  saving: boolean
}

export function PagamentoDialog({ emprestimo, onClose, onSubmit, saving }: Props) {
  const form = useForm<PagamentoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      valor: emprestimo?.valor_total_devido,
      data_pagamento: new Date().toISOString().slice(0, 10),
      tipo: 'quitacao',
      observacoes: '',
    },
  })

  if (!emprestimo) return null

  return (
    <Dialog open={!!emprestimo} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>
            Registrar pagamento — {emprestimo.cliente_nome}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl p-3 border mb-2" style={{ background: 'rgba(0,229,204,0.07)', borderColor: 'rgba(0,229,204,0.25)' }}>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Valor devido hoje</p>
          <p className="text-2xl font-bold" style={{ color: '#00e5cc' }}>
            {formatBRL(emprestimo.valor_total_devido)}
          </p>
          {emprestimo.dias_atraso > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--destructive)' }}>
              {emprestimo.dias_atraso} dia{emprestimo.dias_atraso > 1 ? 's' : ''} de atraso
            </p>
          )}
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Tipo</Label>
            <select
              defaultValue="quitacao"
              onChange={(e) => form.setValue('tipo', e.target.value as 'parcial' | 'quitacao')}
              className="w-full rounded-lg px-3 py-2 text-sm border appearance-none"
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <option value="quitacao">Quitação total</option>
              <option value="parcial">Pagamento parcial</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Valor pago (R$)</Label>
            <Input
              type="number" step="0.01" min="0.01"
              {...form.register('valor', { valueAsNumber: true })}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Data do pagamento</Label>
            <Input
              type="date"
              {...form.register('data_pagamento')}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Observações</Label>
            <Textarea
              rows={3}
              placeholder="Alguma anotação sobre este pagamento..."
              {...form.register('observacoes')}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
