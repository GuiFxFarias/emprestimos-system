'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  BUCKET_DOCUMENTOS_CLIENTE,
  TIPOS_DOCUMENTO,
  ehPdf,
  validarArquivoDocumento,
  type DocumentoAcao,
  type DocumentosAcoes,
  type TipoDocumento,
  type ColunaDocumento,
} from '@/lib/documentos-cliente'
import type { Cliente } from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, ExternalLink, FileCheck2, FileText, ImageOff, Loader2, Paperclip, RefreshCw, Trash2, Undo2 } from 'lucide-react'

// URL assinada (bucket privado). Guarda o path de origem junto: se o path
// mudar, a URL antiga é ignorada até a nova chegar.
function useDocumentoUrl(path: string | null) {
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!path) return
    let ativo = true
    createClient()
      .storage.from(BUCKET_DOCUMENTOS_CLIENTE)
      .createSignedUrl(path, 3600)
      .then(({ data }) => { if (ativo) setSigned({ path, url: data?.signedUrl ?? null }) })
    return () => { ativo = false }
  }, [path])

  if (!path) return { url: null, loading: false, erro: false }
  if (signed?.path !== path) return { url: null, loading: true, erro: false }
  return { url: signed.url, loading: false, erro: !signed.url }
}

export interface DocumentoAberto {
  path: string
  titulo: string
}

export function DocumentoClienteDialog({ doc, onClose }: { doc: DocumentoAberto | null; onClose: () => void }) {
  const path = doc?.path ?? null
  const { url, loading, erro } = useDocumentoUrl(path)
  const pdf = ehPdf(path)

  return (
    <Dialog open={!!doc} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="sm:max-w-3xl max-h-[95vh] overflow-y-auto"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground)' }}>{doc?.titulo}</DialogTitle>
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
              <p className="text-sm">Não foi possível carregar o documento</p>
            </div>
          ) : pdf ? (
            // PDF em iframe não renderiza no celular; mostra só o atalho pra abrir
            <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'var(--muted-foreground)' }}>
              <FileText className="w-10 h-10" />
              <p className="text-sm">Documento em PDF</p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Supabase
            <img src={url} alt={doc?.titulo} className="w-full max-h-[75vh] object-contain" />
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
              <ExternalLink className="w-3.5 h-3.5" /> {pdf ? 'Abrir PDF' : 'Abrir em tamanho real'}
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Chips no card do cliente com os documentos anexados
export function DocumentosChips({ cliente, onAbrir }: { cliente: Cliente; onAbrir: (doc: DocumentoAberto) => void }) {
  const anexados = TIPOS_DOCUMENTO.filter(d => cliente[d.coluna])
  if (anexados.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      {anexados.map(d => (
        <button
          key={d.tipo}
          type="button"
          onClick={() => onAbrir({ path: cliente[d.coluna]!, titulo: `${d.label} — ${cliente.nome}` })}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-80"
          style={{ background: 'rgba(0,229,204,0.12)', color: 'var(--accent-2, #00e5cc)' }}
        >
          <FileCheck2 className="w-3 h-3" /> {d.curto}
        </button>
      ))}
    </div>
  )
}

interface CamposProps {
  // valores salvos (null ao criar cliente)
  cliente: Pick<Cliente, ColunaDocumento> | null
  acoes: DocumentosAcoes
  onChange: (tipo: TipoDocumento, acao: DocumentoAcao) => void
  onVer: (doc: DocumentoAberto) => void
}

export function DocumentosClienteCampos({ cliente, acoes, onChange, onVer }: CamposProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label style={{ color: 'var(--muted-foreground)' }}>Documentos</Label>
      <div className="rounded-xl border divide-y" style={{ borderColor: 'var(--border)' }}>
        {TIPOS_DOCUMENTO.map(d => (
          <DocumentoLinha
            key={d.tipo}
            label={d.label}
            atual={cliente?.[d.coluna] ?? null}
            acao={acoes[d.tipo]}
            onChange={acao => onChange(d.tipo, acao)}
            onVer={path => onVer({ path, titulo: d.label })}
          />
        ))}
      </div>
      <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        Foto (câmera ou galeria) ou PDF.
      </p>
    </div>
  )
}

interface LinhaProps {
  label: string
  atual: string | null
  acao: DocumentoAcao
  onChange: (acao: DocumentoAcao) => void
  onVer: (path: string) => void
}

function DocumentoLinha({ label, atual, acao, onChange, onVer }: LinhaProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!file) return
    const erro = validarArquivoDocumento(file)
    if (erro) { toast.error(erro); return }
    onChange({ tipo: 'novo', arquivo: file })
  }

  let status: string
  let corStatus = 'var(--muted-foreground)'
  if (acao.tipo === 'novo') { status = acao.arquivo.name; corStatus = 'var(--primary)' }
  else if (acao.tipo === 'remover') { status = 'Será removido ao salvar'; corStatus = 'var(--destructive)' }
  else if (atual) { status = ehPdf(atual) ? 'PDF anexado' : 'Foto anexada'; corStatus = 'var(--accent-2, #00e5cc)' }
  else status = 'Não anexado'

  const temArquivo = acao.tipo === 'novo' || (acao.tipo === 'manter' && !!atual)
  const iconBtn = 'w-8 h-8 shrink-0'

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={escolher} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: corStatus }}>{status}</p>
      </div>

      {acao.tipo === 'manter' && atual && (
        <Button type="button" variant="ghost" size="icon" className={`${iconBtn} hover:bg-primary/10`}
          style={{ color: 'var(--muted-foreground)' }} title="Ver" onClick={() => onVer(atual)}>
          <Eye className="w-4 h-4" />
        </Button>
      )}

      {acao.tipo === 'remover' ? (
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 shrink-0"
          style={{ color: 'var(--muted-foreground)' }} onClick={() => onChange({ tipo: 'manter' })}>
          <Undo2 className="w-3.5 h-3.5" /> Desfazer
        </Button>
      ) : (
        <>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            onClick={() => inputRef.current?.click()}>
            {temArquivo ? <RefreshCw className="w-3.5 h-3.5" /> : <Paperclip className="w-3.5 h-3.5" />}
            {temArquivo ? 'Trocar' : 'Anexar'}
          </Button>
          {temArquivo && (
            <Button type="button" variant="ghost" size="icon" className={`${iconBtn} hover:bg-destructive/10`}
              style={{ color: 'var(--destructive)' }}
              title={acao.tipo === 'novo' ? 'Cancelar arquivo escolhido' : 'Remover'}
              // arquivo recém-escolhido: volta pro estado salvo; senão, remove o salvo
              onClick={() => onChange(acao.tipo === 'novo' ? { tipo: 'manter' } : { tipo: 'remover' })}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </>
      )}
    </div>
  )
}
