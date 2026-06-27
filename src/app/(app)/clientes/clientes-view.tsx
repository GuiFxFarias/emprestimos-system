'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys, fetchClientes, fetchEmprestimosCalculados } from '@/lib/queries'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ClienteAvatar } from '@/components/cliente-avatar'
import { Users, Plus, Search, Pencil, Trash2, Loader2, Phone, FileText, Camera } from 'lucide-react'
import type { Cliente, EmprestimoCalculado } from '@/lib/types'

const schema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  telefone: z.string().optional(),
  documento: z.string().optional(),
  endereco: z.string().optional(),
  observacoes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ClienteComStats extends Cliente {
  emprestimos_ativos: number
  total_devido: number
}

interface Props {
  initialClientes: Cliente[]
  initialEmprestimos: EmprestimoCalculado[]
}

export function ClientesView({ initialClientes, initialEmprestimos }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingFotoUrl, setEditingFotoUrl] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: queryKeys.clientes(),
    queryFn: fetchClientes,
    initialData: initialClientes,
  })

  const { data: emprestimos = [], isLoading: loadingEmps } = useQuery({
    queryKey: queryKeys.emprestimosCalculados(),
    queryFn: fetchEmprestimosCalculados,
    initialData: initialEmprestimos,
  })

  const loading = loadingClientes || loadingEmps

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })
  const nomeWatch = watch('nome') ?? ''

  // ── Stats ────────────────────────────────────────────────────
  const statsMap: Record<string, { ativos: number; total: number }> = {}
  for (const e of emprestimos) {
    if (!statsMap[e.cliente_id]) statsMap[e.cliente_id] = { ativos: 0, total: 0 }
    if (e.status === 'ativo') {
      statsMap[e.cliente_id].ativos++
      statsMap[e.cliente_id].total += e.valor_total_devido
    }
  }
  const clientesComStats: ClienteComStats[] = clientes.map(c => ({
    ...c,
    emprestimos_ativos: statsMap[c.id]?.ativos ?? 0,
    total_devido: statsMap[c.id]?.total ?? 0,
  }))

  const filtered = clientesComStats.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.telefone ?? '').includes(search)
  )

  // ── Helpers ──────────────────────────────────────────────────
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.clientes() })
    queryClient.invalidateQueries({ queryKey: queryKeys.emprestimosCalculados() })
  }

  function openCreate() {
    setEditingId(null)
    setEditingFotoUrl(null)
    setFoto(null)
    setFotoPreview(null)
    reset({ nome: '', telefone: '', documento: '', endereco: '', observacoes: '' })
    setOpen(true)
  }

  function openEdit(c: ClienteComStats) {
    setEditingId(c.id)
    setEditingFotoUrl(c.foto_url)
    setFoto(null)
    setFotoPreview(null)
    reset({
      nome: c.nome,
      telefone: c.telefone ?? '',
      documento: c.documento ?? '',
      endereco: c.endereco ?? '',
      observacoes: c.observacoes ?? '',
    })
    setOpen(true)
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFoto(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  async function uploadFoto(ownerId: string, clienteId: string, file: File): Promise<string | null> {
    const supabase = createClient()
    const path = `${ownerId}/${clienteId}`
    const { error } = await supabase.storage
      .from('fotos-clientes')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) { toast.error('Erro ao enviar foto: ' + error.message); return null }
    return path
  }

  // ── Mutations ─────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        nome: values.nome,
        telefone: values.telefone || null,
        documento: values.documento || null,
        endereco: values.endereco || null,
        observacoes: values.observacoes || null,
      }

      if (editingId) {
        let foto_url = editingFotoUrl
        if (foto) foto_url = await uploadFoto(user!.id, editingId, foto)
        const { error } = await supabase.from('clientes').update({ ...payload, foto_url }).eq('id', editingId)
        if (error) throw new Error(error.message)
      } else {
        const { data: novo, error } = await supabase
          .from('clientes')
          .insert({ ...payload, owner_id: user!.id })
          .select('id')
          .single()
        if (error || !novo) throw new Error(error?.message ?? 'Erro desconhecido')

        if (foto) {
          const foto_url = await uploadFoto(user!.id, novo.id, foto)
          if (foto_url) {
            await supabase.from('clientes').update({ foto_url }).eq('id', novo.id)
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Cliente atualizado!' : 'Cliente criado!')
      setOpen(false)
      setFoto(null)
      setFotoPreview(null)
      invalidate()
    },
    onError: (err: Error) => toast.error('Erro ao salvar: ' + err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('clientes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Cliente excluído!')
      setDeleteId(null)
      invalidate()
    },
    onError: (err: { code?: string; message: string }) => {
      if (err.code === '23503') {
        toast.error('Não é possível excluir: cliente possui empréstimos ativos.')
      } else {
        toast.error('Erro ao excluir: ' + err.message)
      }
      setDeleteId(null)
    },
  })

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Clientes</h1>
        </div>
        <Button
          onClick={openCreate}
          size="sm"
          className="gap-2 font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo cliente</span>
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Users className="w-12 h-12" style={{ color: 'var(--muted-foreground)' }} />
          <p style={{ color: 'var(--muted-foreground)' }}>
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}
          </p>
          {!search && (
            <Button onClick={openCreate} variant="outline" size="sm" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Criar primeiro cliente
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(c => (
            <div
              key={c.id}
              className="rounded-2xl border p-4 flex items-center gap-3 transition-colors hover:border-primary/30"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <ClienteAvatar fotoPath={c.foto_url} nome={c.nome} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{c.nome}</span>
                  {c.emprestimos_ativos > 0 && (
                    <Badge
                      className="text-xs"
                      style={{ background: 'rgba(0,198,255,0.15)', color: 'var(--primary)', border: 'none' }}
                    >
                      {c.emprestimos_ativos} ativo{c.emprestimos_ativos > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {c.telefone && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <Phone className="w-3 h-3" />{c.telefone}
                    </span>
                  )}
                  {c.documento && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <FileText className="w-3 h-3" />{c.documento}
                    </span>
                  )}
                </div>
                {c.emprestimos_ativos > 0 && (
                  <p className="text-xs mt-1 font-medium" style={{ color: 'var(--accent-2, #00e5cc)' }}>
                    Total devido: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.total_devido)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon"
                  className="w-8 h-8 hover:bg-primary/10 hover:text-primary"
                  onClick={() => openEdit(c)}
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="w-8 h-8 hover:bg-destructive/10"
                  onClick={() => setDeleteId(c.id)}
                  style={{ color: 'var(--destructive)' }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={v => { if (!v) { setOpen(false); setFoto(null); setFotoPreview(null) } }}>
        <DialogContent style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--foreground)' }}>
              {editingId ? 'Editar cliente' : 'Novo cliente'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(v => saveMutation.mutate(v))} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col items-center gap-2">
              <div className="relative cursor-pointer group" onClick={() => fotoInputRef.current?.click()}>
                {fotoPreview ? (
                  <img src={fotoPreview} alt="preview" className="w-20 h-20 rounded-2xl object-cover" />
                ) : (
                  <ClienteAvatar fotoPath={editingFotoUrl} nome={nomeWatch} size={80} className="rounded-2xl" />
                )}
                <div
                  className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.45)' }}
                >
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                Clique para {editingFotoUrl || fotoPreview ? 'alterar' : 'adicionar'} foto
              </p>
              <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Nome *</Label>
              <Input {...register('nome')} style={{ background: 'var(--input)', borderColor: errors.nome ? 'var(--destructive)' : 'var(--border)', color: 'var(--foreground)' }} />
              {errors.nome && <p className="text-xs" style={{ color: 'var(--destructive)' }}>{errors.nome.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Telefone</Label>
              <Input {...register('telefone')} placeholder="(11) 99999-9999" style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>CPF / CNPJ</Label>
              <Input {...register('documento')} style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Endereço</Label>
              <Textarea rows={2} placeholder="Rua, número, bairro..." {...register('endereco')} style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ color: 'var(--muted-foreground)' }}>Observações</Label>
              <Textarea rows={3} placeholder="Informações adicionais sobre o cliente..." {...register('observacoes')} style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <DialogContent style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--foreground)' }}>Excluir cliente?</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Esta ação não pode ser desfeita. Clientes com empréstimos ativos não podem ser excluídos.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Cancelar
            </Button>
            <Button
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              style={{ background: 'var(--destructive)', color: '#fff' }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
