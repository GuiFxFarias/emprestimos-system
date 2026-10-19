'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addDays, format, parseISO } from 'date-fns'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { formatBRL, formatDate } from '@/lib/format'
import { diasParaVencer, hojeLocal, jurosCheque, entregueCheque } from '@/lib/cheques'
import type { Cheque, Cliente } from '@/lib/types'

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecione um cliente'),
  valor: z.number().min(0.01, 'Valor deve ser maior que zero'),
  taxa_juros: z.number().min(0),
  data_entrada: z.string().min(1, 'Data obrigatória'),
  data_vencimento: z.string().min(1, 'Vencimento obrigatório'),
  banco: z.string().optional(),
  numero: z.string().optional(),
  observacoes: z.string().optional(),
}).refine(v => v.data_vencimento >= v.data_entrada, {
  message: 'Vencimento não pode ser antes da data de entrada',
  path: ['data_vencimento'],
})

export type ChequeFormValues = z.infer<typeof schema>

const PRAZOS_RAPIDOS = [30, 60, 90]

function somarDias(data: string, dias: number): string {
  return format(addDays(parseISO(data), dias), 'yyyy-MM-dd')
}

function valoresIniciais(cheque: Cheque | null): ChequeFormValues {
  if (cheque) {
    return {
      cliente_id: cheque.cliente_id,
      valor: cheque.valor,
      taxa_juros: cheque.taxa_juros,
      data_entrada: cheque.data_entrada,
      data_vencimento: cheque.data_vencimento,
      banco: cheque.banco ?? '',
      numero: cheque.numero ?? '',
      observacoes: cheque.observacoes ?? '',
    }
  }
  const hoje = hojeLocal()
  return {
    cliente_id: '',
    valor: undefined as unknown as number,
    taxa_juros: 0,
    data_entrada: hoje,
    data_vencimento: somarDias(hoje, 60),
    banco: '',
    numero: '',
    observacoes: '',
  }
}

interface Props {
  open: boolean
  // null = novo cheque
  cheque: Cheque | null
  clientes: Cliente[]
  onClose: () => void
  onSubmit: (values: ChequeFormValues) => Promise<void>
  saving: boolean
}

export function ChequeDialog({ open, cheque, clientes, onClose, onSubmit, saving }: Props) {
  const form = useForm<ChequeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais(cheque),
  })

  useEffect(() => {
    if (open) form.reset(valoresIniciais(cheque))
  }, [open, cheque?.id])

  const watched = form.watch()
  const valor = Number(watched.valor) || 0
  const taxa = Number(watched.taxa_juros) || 0
  const juros = jurosCheque({ valor, taxa_juros: taxa })
  const prazo = watched.data_entrada && watched.data_vencimento
    ? diasParaVencer({ data_vencimento: watched.data_vencimento }, watched.data_entrada)
    : null

  const labelStyle = { color: 'var(--muted-foreground)' }
  const inputStyle = { background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }
  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>
            {cheque ? 'Editar cheque' : 'Novo cheque'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label style={labelStyle}>Cliente *</Label>
            <Controller
              control={form.control}
              name="cliente_id"
              render={({ field }) => (
                <Select
                  items={clientes.map(c => ({ value: c.id, label: c.nome }))}
                  value={field.value || null}
                  onValueChange={v => field.onChange(v ?? '')}
                >
                  <SelectTrigger className="w-full" style={inputStyle}>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.cliente_id && (
              <p className="text-xs" style={{ color: 'var(--destructive)' }}>{errors.cliente_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={labelStyle}>Valor do cheque (R$) *</Label>
              <Input
                type="number" step="0.01" min="0.01"
                {...form.register('valor', { valueAsNumber: true })}
                style={inputStyle}
              />
              {errors.valor && (
                <p className="text-xs" style={{ color: 'var(--destructive)' }}>{errors.valor.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={labelStyle}>Juros cobrado (% total)</Label>
              <Input
                type="number" step="0.001" min="0"
                {...form.register('taxa_juros', { valueAsNumber: true })}
                style={inputStyle}
              />
              <p className="text-xs" style={labelStyle}>Ex.: 10% ao mês × 2 meses = 20</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={labelStyle}>Data da troca</Label>
              <Input type="date" {...form.register('data_entrada')} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={labelStyle}>Vencimento (bom para) *</Label>
              <Input type="date" {...form.register('data_vencimento')} style={inputStyle} />
            </div>
          </div>
          <div className="flex items-center gap-2 -mt-2">
            <span className="text-xs" style={labelStyle}>Vence em:</span>
            {PRAZOS_RAPIDOS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => watched.data_entrada && form.setValue('data_vencimento', somarDias(watched.data_entrada, d), { shouldValidate: true })}
                className="text-xs px-2 py-0.5 rounded-md border cursor-pointer hover:bg-primary/10 hover:text-primary"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                {d} dias
              </button>
            ))}
          </div>
          {errors.data_vencimento && (
            <p className="text-xs -mt-2" style={{ color: 'var(--destructive)' }}>{errors.data_vencimento.message}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={labelStyle}>Banco</Label>
              <Input placeholder="Opcional" {...form.register('banco')} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={labelStyle}>Nº do cheque</Label>
              <Input placeholder="Opcional" {...form.register('numero')} style={inputStyle} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={labelStyle}>Observações</Label>
            <Textarea
              rows={2}
              placeholder="Anotações sobre este cheque..."
              {...form.register('observacoes')}
              style={inputStyle}
            />
          </div>

          {valor > 0 && (
            <div className="rounded-xl p-3 flex flex-col gap-1 border" style={{ background: 'rgba(0,198,255,0.07)', borderColor: 'rgba(0,198,255,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Resumo</p>
              <div className="flex items-center justify-between text-sm">
                <span style={labelStyle}>Valor do cheque</span>
                <span style={{ color: 'var(--foreground)' }}>{formatBRL(valor)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={labelStyle}>Seus juros ({taxa}%)</span>
                <span style={{ color: 'var(--foreground)' }}>− {formatBRL(juros)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span style={labelStyle}>Entregar ao cliente</span>
                <span style={{ color: '#00e5cc' }}>{formatBRL(entregueCheque({ valor, taxa_juros: taxa }))}</span>
              </div>
              {watched.data_vencimento && prazo != null && prazo >= 0 && (
                <p className="text-xs mt-1" style={labelStyle}>
                  No dia {formatDate(watched.data_vencimento)} ({prazo} dia{prazo !== 1 ? 's' : ''} após a troca) você
                  desconta {formatBRL(valor)}. Até lá não fica vermelho — só um aviso amarelo nos 7 dias antes.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : cheque ? 'Salvar' : 'Cadastrar cheque'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface CompensarProps {
  cheque: Cheque | null
  onClose: () => void
  onConfirm: (dataCompensacao: string) => Promise<void>
  saving: boolean
}

export function CompensarChequeDialog({ cheque, onClose, onConfirm, saving }: CompensarProps) {
  const form = useForm<{ data: string }>({ defaultValues: { data: hojeLocal() } })

  useEffect(() => {
    if (cheque) form.reset({ data: hojeLocal() })
  }, [cheque?.id])

  if (!cheque) return null

  const labelStyle = { color: 'var(--muted-foreground)' }

  return (
    <Dialog open={!!cheque} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>Marcar como compensado</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl p-3 border flex flex-col gap-1" style={{ background: 'rgba(0,229,204,0.05)', borderColor: 'rgba(0,229,204,0.2)' }}>
          <div className="flex justify-between text-sm">
            <span style={labelStyle}>Capital (volta pro caixa)</span>
            <span style={{ color: 'var(--foreground)' }}>{formatBRL(entregueCheque(cheque))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={labelStyle}>Juros (lucro)</span>
            <span style={{ color: 'var(--foreground)' }}>{formatBRL(jurosCheque(cheque))}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t mt-1 pt-1.5" style={{ borderColor: 'rgba(0,229,204,0.2)' }}>
            <span style={{ color: 'var(--foreground)' }}>Valor do cheque recebido</span>
            <span style={{ color: '#00e5cc' }}>{formatBRL(cheque.valor)}</span>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(v => onConfirm(v.data))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label style={labelStyle}>Data da compensação</Label>
            <Input
              type="date"
              {...form.register('data', { required: true })}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} style={{ background: '#00e5cc', color: '#040d1f' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar compensação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
