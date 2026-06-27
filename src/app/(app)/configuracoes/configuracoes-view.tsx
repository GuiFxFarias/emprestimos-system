'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys, fetchConfiguracoes } from '@/lib/queries'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Settings } from 'lucide-react'
import type { Configuracoes } from '@/lib/types'

const schema = z.object({
  taxa_juros_padrao: z.number().min(0),
  prazo_padrao_dias: z.number().int().min(1),
  juros_mora_diario_reais: z.number().min(0),
})

type FormValues = z.infer<typeof schema>

const fields: { name: keyof FormValues; label: string; help: string; step: string }[] = [
  {
    name: 'taxa_juros_padrao',
    label: 'Taxa de juros padrão (%)',
    help: 'Percentual aplicado sobre o principal uma única vez no período. Ex.: 20% em 30 dias = R$ 200 de juros sobre R$ 1.000.',
    step: '0.001',
  },
  {
    name: 'prazo_padrao_dias',
    label: 'Prazo padrão (dias)',
    help: 'Número de dias até o vencimento. A data de vencimento é calculada automaticamente.',
    step: '1',
  },
  {
    name: 'juros_mora_diario_reais',
    label: 'Juros de mora diário (R$)',
    help: 'Valor fixo em reais cobrado por dia de atraso. Ex.: R$ 5,00/dia. Use 0 para desativar.',
    step: '0.01',
  },
]

export function ConfiguracoesView({ initialConfig }: { initialConfig: Configuracoes | null }) {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.configuracoes(),
    queryFn: fetchConfiguracoes,
    initialData: initialConfig,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: config
      ? {
          taxa_juros_padrao: config.taxa_juros_padrao,
          prazo_padrao_dias: config.prazo_padrao_dias,
          juros_mora_diario_reais: config.juros_mora_diario_reais,
        }
      : undefined,
  })

  // Sincroniza o form quando o config chegar (caso initialData seja null)
  useEffect(() => {
    if (config) {
      reset({
        taxa_juros_padrao: config.taxa_juros_padrao,
        prazo_padrao_dias: config.prazo_padrao_dias,
        juros_mora_diario_reais: config.juros_mora_diario_reais,
      })
    }
  }, [config, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      const payload = { ...values, owner_id: user.id, updated_at: new Date().toISOString() }

      if (config?.id) {
        const { error } = await supabase.from('configuracoes').update(payload).eq('id', config.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('configuracoes').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!')
      queryClient.invalidateQueries({ queryKey: queryKeys.configuracoes() })
    },
    onError: (err: Error) => toast.error('Erro ao salvar: ' + err.message),
  })

  return (
    <div className="p-4 md:p-8 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6" style={{ color: 'var(--primary)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Configurações</h1>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" style={{ background: 'var(--muted)' }} />
              <Skeleton className="h-10 w-full" style={{ background: 'var(--muted)' }} />
              <Skeleton className="h-3 w-full" style={{ background: 'var(--muted)' }} />
            </div>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit(v => saveMutation.mutate(v))} className="flex flex-col gap-6">
          <div
            className="rounded-2xl p-5 border flex flex-col gap-5"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {fields.map(({ name, label, help, step }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <Label style={{ color: 'var(--foreground)' }}>{label}</Label>
                <Input
                  type="number"
                  step={step}
                  min="0"
                  {...register(name, { valueAsNumber: true })}
                  style={{
                    background: 'var(--input)',
                    borderColor: errors[name] ? 'var(--destructive)' : 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{help}</p>
                {errors[name] && (
                  <p className="text-xs" style={{ color: 'var(--destructive)' }}>{errors[name]?.message}</p>
                )}
              </div>
            ))}
          </div>

          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar configurações'}
          </Button>
        </form>
      )}
    </div>
  )
}
