'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calcularPreview } from '@/lib/calculo'
import { formatBRL } from '@/lib/format'
import type { Cliente, Configuracoes } from '@/lib/types'

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecione um cliente'),
  valor_principal: z.number().min(0.01, 'Valor deve ser maior que zero'),
  taxa_juros: z.number().min(0),
  prazo_dias: z.number().int().min(1),
  juros_mora_diario_reais: z.number().min(0),
  data_emprestimo: z.string().min(1, 'Data obrigatória'),
  observacoes: z.string().optional(),
})

export type EmprestimoFormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  clientes: Cliente[]
  config: Configuracoes | null
  onSubmit: (values: EmprestimoFormValues) => Promise<void>
  saving: boolean
  defaultClienteId?: string
}

export function NovoEmprestimoDialog({ open, onOpenChange, clientes, config, onSubmit, saving, defaultClienteId }: Props) {
  const form = useForm<EmprestimoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      cliente_id: defaultClienteId ?? '',
      taxa_juros: config?.taxa_juros_padrao ?? 0,
      prazo_dias: config?.prazo_padrao_dias ?? 30,
      juros_mora_diario_reais: config?.juros_mora_diario_reais ?? 0,
      data_emprestimo: new Date().toISOString().slice(0, 10),
      observacoes: '',
    },
  })

  const watched = form.watch()

  const preview = (() => {
    const { valor_principal, taxa_juros, prazo_dias, data_emprestimo } = watched
    if (!valor_principal || !data_emprestimo) return null
    return calcularPreview({
      valorPrincipal: Number(valor_principal),
      taxaJuros: Number(taxa_juros ?? 0),
      prazoDias: Number(prazo_dias ?? 30),
      jurosMoraDiarioReais: Number(watched.juros_mora_diario_reais ?? 0),
      dataEmprestimo: data_emprestimo,
    })
  })()

  function handleOpenChange(v: boolean) {
    if (!v) {
      form.reset({
        cliente_id: defaultClienteId ?? '',
        taxa_juros: config?.taxa_juros_padrao ?? 0,
        prazo_dias: config?.prazo_padrao_dias ?? 30,
        juros_mora_diario_reais: config?.juros_mora_diario_reais ?? 0,
        data_emprestimo: new Date().toISOString().slice(0, 10),
        observacoes: '',
      })
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>Novo empréstimo</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Cliente *</Label>
            {defaultClienteId ? (
              <div
                className="rounded-lg px-3 py-2 text-sm font-medium border"
                style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                {clientes.find(c => c.id === defaultClienteId)?.nome ?? 'Cliente selecionado'}
              </div>
            ) : (
              <Controller
                control={form.control}
                name="cliente_id"
                render={({ field }) => (
                  <Select
                    items={clientes.map(c => ({ value: c.id, label: c.nome }))}
                    value={field.value || null}
                    onValueChange={v => field.onChange(v ?? '')}
                  >
                    <SelectTrigger
                      className="w-full"
                      style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    >
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
            )}
            {form.formState.errors.cliente_id && (
              <p className="text-xs" style={{ color: 'var(--destructive)' }}>{form.formState.errors.cliente_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Principal (R$) *</Label>
              <Input
                type="number" step="0.01" min="0.01"
                {...form.register('valor_principal', { valueAsNumber: true })}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Data</Label>
              <Input
                type="date"
                {...form.register('data_emprestimo')}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Taxa de juros (%)</Label>
              <Input type="number" step="0.001" min="0" {...form.register('taxa_juros', { valueAsNumber: true })}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Prazo (dias)</Label>
              <Input type="number" min="1" {...form.register('prazo_dias', { valueAsNumber: true })}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Mora/dia (R$)</Label>
            <Input type="number" step="0.01" min="0" {...form.register('juros_mora_diario_reais', { valueAsNumber: true })}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Observações</Label>
            <Textarea
              rows={3}
              placeholder="Anotações sobre este empréstimo..."
              {...form.register('observacoes')}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          {preview && (
            <div className="rounded-xl p-3 flex flex-col gap-1 border" style={{ background: 'rgba(0,198,255,0.07)', borderColor: 'rgba(0,198,255,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Preview</p>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted-foreground)' }}>Vencimento</span>
                <span style={{ color: 'var(--foreground)' }}>
                  {format(preview.dataVencimento, 'dd/MM/yyyy', { locale: ptBR })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted-foreground)' }}>Juros</span>
                <span style={{ color: 'var(--foreground)' }}>{formatBRL(preview.valorJuros)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span style={{ color: 'var(--muted-foreground)' }}>Valor no vencimento</span>
                <span style={{ color: '#00e5cc' }}>{formatBRL(preview.valorNoVencimento)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar empréstimo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
