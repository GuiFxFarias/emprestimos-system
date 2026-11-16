'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BUCKET_FOTOS_CHEQUE } from '@/lib/fotos-cheque'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buttonVariants } from '@/components/ui/button'
import { ExternalLink, ImageOff, Loader2 } from 'lucide-react'

// URL assinada (bucket privado). Guarda o path de origem junto: se o path
// mudar, a URL antiga é ignorada até a nova chegar.
export function useFotoChequeUrl(path: string | null | undefined) {
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!path) return
    let ativo = true
    createClient()
      .storage.from(BUCKET_FOTOS_CHEQUE)
      .createSignedUrl(path, 3600)
      .then(({ data }) => { if (ativo) setSigned({ path, url: data?.signedUrl ?? null }) })
    return () => { ativo = false }
  }, [path])

  if (!path) return { url: null, loading: false, erro: false }
  if (signed?.path !== path) return { url: null, loading: true, erro: false }
  return { url: signed.url, loading: false, erro: !signed.url }
}

interface Props {
  // null = fechado
  path: string | null
  titulo?: string
  onClose: () => void
}

export function ChequeFotoDialog({ path, titulo, onClose }: Props) {
  const { url, loading, erro } = useFotoChequeUrl(path)

  return (
    <Dialog open={!!path} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="sm:max-w-3xl max-h-[95vh] overflow-y-auto"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>{titulo ?? 'Foto do cheque'}</DialogTitle>
        </DialogHeader>

        <div
          className="rounded-xl overflow-hidden flex items-center justify-center min-h-48"
          style={{ background: 'var(--muted)' }}
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
          ) : erro || !url ? (
            <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'var(--muted-foreground)' }}>
              <ImageOff className="w-8 h-8" />
              <p className="text-sm">Não foi possível carregar a foto</p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Supabase
            <img src={url} alt={titulo ?? 'Foto do cheque'} className="w-full max-h-[75vh] object-contain" />
          )}
        </div>

        {url && (
          <div className="flex justify-end">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir em tamanho real
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
