'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
import { Switch } from '@/components/ui/switch'
import { calcularPreview } from '@/lib/calculo'
import { formatBRL } from '@/lib/format'
import type { EmprestimoCalculado } from '@/lib/types'

const schema = z.object({
  valor_principal: z.number().min(0.01, 'Valor obrigatório'),
  taxa_juros: z.number().min(0),
  prazo_dias: z.number().int().min(1),
  juros_mora_diario_reais: z.number().min(0),
  data_emprestimo: z.string().min(1, 'Data obrigatória'),
  observacoes: z.string().optional(),
  status: z.enum(['ativo', 'negociado', 'quitado']),
  data_quitacao: z.string().optional(),
  valor_quitado: z.number().min(0).optional(),
  congelar_negociacao: z.boolean().optional(),
  data_negociacao: z.string().optional(),
  valor_negociado: z.number().min(0).optional(),
  parcelas_negociado: z.number().int().min(1).optional(),
  ja_quitado: z.boolean().optional(),
})

// valueAsNumber vira NaN quando o input fica vazio; isso converte pra
// undefined em vez de deixar o Zod rejeitar um campo opcional
function toOptionalNumber(v: string): number | undefined {
  if (v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

export type EditEmprestimoFormValues = z.infer<typeof schema>

interface Props {
  emprestimo: EmprestimoCalculado | null
  onClose: () => void
  onSubmit: (values: EditEmprestimoFormValues) => Promise<void>
  saving: boolean
}

export function EditarEmprestimoDialog({ emprestimo, onClose, onSubmit, saving }: Props) {
  const form = useForm<EditEmprestimoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      valor_principal: 0,
      taxa_juros: 0,
      prazo_dias: 30,
      juros_mora_diario_reais: 0,
      data_emprestimo: '',
      observacoes: '',
      status: 'ativo',
      data_quitacao: '',
      valor_quitado: undefined,
      congelar_negociacao: false,
      data_negociacao: '',
      valor_negociado: undefined,
      parcelas_negociado: undefined,
      ja_quitado: false,
    },
  })

  useEffect(() => {
    if (emprestimo) {
      form.reset({
        valor_principal: emprestimo.valor_principal,
        taxa_juros: emprestimo.taxa_juros,
        prazo_dias: emprestimo.prazo_dias,
        juros_mora_diario_reais: emprestimo.juros_mora_diario_reais,
        data_emprestimo: emprestimo.data_emprestimo,
        observacoes: emprestimo.observacoes ?? '',
        status: emprestimo.status,
        data_quitacao: emprestimo.data_quitacao ?? '',
        valor_quitado: emprestimo.valor_quitado ?? undefined,
        congelar_negociacao: !!emprestimo.data_negociacao,
        data_negociacao: emprestimo.data_negociacao ?? '',
        valor_negociado: emprestimo.valor_negociado ?? undefined,
        parcelas_negociado: emprestimo.parcelas_negociado ?? undefined,
        ja_quitado: false,
      })
    }
  }, [emprestimo, form])

  const watched = form.watch()
  const status = watched.status

  const preview = (() => {
    const { valor_principal, taxa_juros, prazo_dias, data_emprestimo } = watched
    if (!valor_principal || !data_emprestimo) return null
    try {
      return calcularPreview({
        valorPrincipal: Number(valor_principal),
        taxaJuros: Number(taxa_juros ?? 0),
        prazoDias: Number(prazo_dias ?? 30),
        jurosMoraDiarioReais: Number(watched.juros_mora_diario_reais ?? 0),
        dataEmprestimo: data_emprestimo,
      })
    } catch {
      return null
    }
  })()

  if (!emprestimo) return null

  return (
    <Dialog open={!!emprestimo} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>Editar empréstimo</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">
          {/* Principal + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Principal (R$)</Label>
              <Input
                type="number" step="0.01" min="0.01"
                disabled={status === 'negociado'}
                {...form.register('valor_principal', { valueAsNumber: true })}
                style={{
                  background: 'var(--input)',
                  borderColor: form.formState.errors.valor_principal ? 'var(--destructive)' : 'var(--border)',
                  color: 'var(--foreground)',
                  ...(status === 'negociado' ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                }}
              />
              {status === 'negociado' && (
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Travado durante negociação — use &quot;Valor negociado&quot; abaixo, o principal não muda.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Data do empréstimo</Label>
              <Input
                type="date"
                {...form.register('data_emprestimo')}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          </div>

          {/* Já quitado (histórico) */}
          <div
            className="rounded-xl p-3 border flex items-center justify-between gap-3"
            style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
          >
            <div className="flex-1 min-w-0">
              <Label style={{ color: 'var(--foreground)' }}>Já quitado (histórico)</Label>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                Marca como já pago desde sempre — valor quitado = principal, data de quitação = data do empréstimo. Diferente de escolher &quot;Quitado&quot; no Status abaixo.
              </p>
            </div>
            <Controller
              control={form.control}
              name="ja_quitado"
              render={({ field }) => (
                <Switch className="shrink-0" checked={field.value ?? false} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {watched.ja_quitado ? (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Este empréstimo será salvo como quitado, com valor quitado igual ao principal e data de quitação igual à data do empréstimo.
            </p>
          ) : (
            <>
          {/* Juros + Prazo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Taxa de juros (%)</Label>
              <Input
                type="number" step="0.001" min="0"
                {...form.register('taxa_juros', { valueAsNumber: true })}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Prazo (dias)</Label>
              <Input
                type="number" min="1"
                {...form.register('prazo_dias', { valueAsNumber: true })}
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          </div>

          {/* Mora/dia */}
          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Mora/dia (R$)</Label>
            <Input
              type="number" step="0.01" min="0"
              {...form.register('juros_mora_diario_reais', { valueAsNumber: true })}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Status</Label>
            <Select
              items={[
                { value: 'ativo', label: 'Ativo' },
                { value: 'negociado', label: 'Negociado' },
                { value: 'quitado', label: 'Quitado' },
              ]}
              value={status}
              onValueChange={v => form.setValue('status', v as 'ativo' | 'negociado' | 'quitado', { shouldValidate: true })}
            >
              <SelectTrigger
                className="w-full"
                style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="negociado">Negociado</SelectItem>
                <SelectItem value="quitado">Quitado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Negociação fields — só aparecem quando status = negociado */}
          {status === 'negociado' && (
            <div
              className="rounded-xl p-3 border flex flex-col gap-3"
              style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label style={{ color: 'var(--foreground)' }}>Congelar cálculo nesta data</Label>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    Trava juros/mora/dias de atraso na data do acordo. Se desligado, os cálculos continuam normalmente.
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name="congelar_negociacao"
                  render={({ field }) => (
                    <Switch
                      className="shrink-0"
                      checked={field.value ?? false}
                      onCheckedChange={checked => {
                        field.onChange(checked)
                        if (checked && !form.getValues('data_negociacao')) {
                          form.setValue('data_negociacao', new Date().toISOString().slice(0, 10))
                        }
                      }}
                    />
                  )}
                />
              </div>
              {watched.congelar_negociacao && (
                <div className="flex flex-col gap-1.5">
                  <Label style={{ color: 'var(--muted-foreground)' }}>Data da negociação</Label>
                  <Input
                    type="date"
                    {...form.register('data_negociacao')}
                    style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label style={{ color: 'var(--muted-foreground)' }}>Valor negociado (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  placeholder="Deixe em branco para usar o valor calculado"
                  {...form.register('valor_negociado', { setValueAs: toOptionalNumber })}
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Se preenchido, substitui o total devido calculado (use para descontos/acordos que fogem da fórmula).
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={{ color: 'var(--muted-foreground)' }}>Em quantas vezes</Label>
                <Input
                  type="number" step="1" min="1"
                  placeholder="Ex: 3"
                  {...form.register('parcelas_negociado', { setValueAs: toOptionalNumber })}
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Só um registro informativo de quantas parcelas foram combinadas — não gera parcelas nem muda o cálculo.
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Use as anotações do empréstimo para registrar o que foi acordado.
              </p>
            </div>
          )}

          {/* Quitação fields — só aparecem quando status = quitado */}
          {status === 'quitado' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label style={{ color: 'var(--muted-foreground)' }}>Data de quitação</Label>
                <Input
                  type="date"
                  {...form.register('data_quitacao')}
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={{ color: 'var(--muted-foreground)' }}>Valor quitado (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  {...form.register('valor_quitado', { setValueAs: toOptionalNumber })}
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          )}
            </>
          )}

          {/* Observações */}
          <div className="flex flex-col gap-1.5">
            <Label style={{ color: 'var(--muted-foreground)' }}>Observações</Label>
            <Textarea
              rows={3}
              placeholder="Anotações sobre este empréstimo..."
              {...form.register('observacoes')}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          {/* Preview */}
          {preview && !watched.ja_quitado && (
            <div
              className="rounded-xl p-3 flex flex-col gap-1 border"
              style={{ background: 'rgba(0,198,255,0.07)', borderColor: 'rgba(0,198,255,0.25)' }}
            >
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
            <Button
              type="button" variant="outline" onClick={onClose}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Cancelar
            </Button>
            <Button
              type="submit" disabled={saving}
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
