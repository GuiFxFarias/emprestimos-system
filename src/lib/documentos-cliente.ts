import { createClient } from '@/lib/supabase/client'
import { comprimirFoto } from '@/lib/fotos-cheque'
import type { Cliente } from '@/lib/types'

export const BUCKET_DOCUMENTOS_CLIENTE = 'documentos-clientes'

export const TIPOS_DOCUMENTO = [
  { tipo: 'cnh', coluna: 'cnh_url', label: 'CNH', curto: 'CNH' },
  { tipo: 'comprovante', coluna: 'comprovante_residencia_url', label: 'Comprovante de residência', curto: 'Comprovante' },
  { tipo: 'holerite', coluna: 'holerite_url', label: 'Holerite', curto: 'Holerite' },
] as const

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]['tipo']
export type ColunaDocumento = (typeof TIPOS_DOCUMENTO)[number]['coluna']

// O que fazer com cada documento ao salvar o cliente
export type DocumentoAcao =
  | { tipo: 'manter' }
  | { tipo: 'novo'; arquivo: File }
  | { tipo: 'remover' }

export type DocumentosAcoes = Record<TipoDocumento, DocumentoAcao>

export const ACOES_INICIAIS: DocumentosAcoes = {
  cnh: { tipo: 'manter' },
  comprovante: { tipo: 'manter' },
  holerite: { tipo: 'manter' },
}

export const TAMANHO_MAXIMO_IMAGEM = 25 * 1024 * 1024
export const TAMANHO_MAXIMO_PDF = 20 * 1024 * 1024

export function ehPdf(path: string | null | undefined): boolean {
  return !!path && path.toLowerCase().endsWith('.pdf')
}

// Retorna a mensagem de erro, ou null se o arquivo é aceito
export function validarArquivoDocumento(file: File): string | null {
  if (file.type === 'application/pdf') {
    return file.size > TAMANHO_MAXIMO_PDF ? 'PDF muito grande (máx. 20 MB)' : null
  }
  if (file.type.startsWith('image/')) {
    return file.size > TAMANHO_MAXIMO_IMAGEM ? 'Imagem muito grande (máx. 25 MB)' : null
  }
  return 'Envie uma foto ou um PDF'
}

function extensao(blob: Blob): string {
  if (blob.type === 'application/pdf') return 'pdf'
  if (blob.type === 'image/jpeg') return 'jpg'
  const ext = blob.type.split('/')[1]
  return ext ? ext.replace(/[^a-z0-9]/gi, '') || 'img' : 'img'
}

// Foto é reduzida/convertida pra JPEG; PDF sobe como está. Nome com timestamp
// pra trocar o arquivo nunca reaproveitar URL assinada antiga em cache.
export async function enviarDocumentoCliente(
  ownerId: string,
  clienteId: string,
  tipo: TipoDocumento,
  file: File,
): Promise<string> {
  const blob = file.type === 'application/pdf' ? file : await comprimirFoto(file)
  const path = `${ownerId}/${clienteId}/${tipo}-${Date.now()}.${extensao(blob)}`
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_CLIENTE)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' })
  if (error) throw new Error(error.message)
  return path
}

// Melhor esforço: se falhar, só sobra arquivo órfão no bucket
export async function removerDocumentosCliente(paths: (string | null | undefined)[]): Promise<void> {
  const validos = paths.filter((p): p is string => !!p)
  if (validos.length === 0) return
  const supabase = createClient()
  await supabase.storage.from(BUCKET_DOCUMENTOS_CLIENTE).remove(validos)
}

// Sobe os arquivos novos e devolve as colunas a gravar + o que limpar depois.
// Se algum upload falhar, apaga os que já subiram e relança o erro.
export async function aplicarAcoesDocumentos(
  ownerId: string,
  clienteId: string,
  cliente: Pick<Cliente, ColunaDocumento> | null,
  acoes: DocumentosAcoes,
): Promise<{ colunas: Partial<Record<ColunaDocumento, string | null>>; enviados: string[]; antigos: string[] }> {
  const colunas: Partial<Record<ColunaDocumento, string | null>> = {}
  const enviados: string[] = []
  const antigos: string[] = []
  try {
    for (const { tipo, coluna } of TIPOS_DOCUMENTO) {
      const acao = acoes[tipo]
      const atual = cliente?.[coluna] ?? null
      if (acao.tipo === 'manter') continue
      if (acao.tipo === 'novo') {
        const path = await enviarDocumentoCliente(ownerId, clienteId, tipo, acao.arquivo)
        enviados.push(path)
        colunas[coluna] = path
      } else {
        colunas[coluna] = null
      }
      if (atual) antigos.push(atual)
    }
  } catch (err) {
    await removerDocumentosCliente(enviados)
    throw err
  }
  return { colunas, enviados, antigos }
}
