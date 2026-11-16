import { createClient } from '@/lib/supabase/client'

export const BUCKET_FOTOS_CHEQUE = 'fotos-cheques'

// Foto de celular vem com 3–8 MB; reduzindo pra 2000px no lado maior em JPEG
// fica ~300–600 KB e o cheque continua legível (valor, nº, assinatura).
const LADO_MAXIMO = 2000
const QUALIDADE_JPEG = 0.85
export const TAMANHO_MAXIMO_ORIGINAL = 25 * 1024 * 1024

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem')) }
    img.src = url
  })
}

// Reduz e converte pra JPEG. Se o navegador não conseguir decodificar o
// formato (ex.: HEIC no Chrome do PC), envia o arquivo original mesmo.
export async function comprimirFoto(file: File): Promise<Blob> {
  try {
    const img = await carregarImagem(file)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight))
    const largura = Math.round(img.naturalWidth * escala)
    const altura = Math.round(img.naturalHeight * escala)
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, largura, altura)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', QUALIDADE_JPEG))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

function extensao(blob: Blob): string {
  if (blob.type === 'image/jpeg') return 'jpg'
  const ext = blob.type.split('/')[1]
  return ext ? ext.replace(/[^a-z0-9]/gi, '') || 'img' : 'img'
}

// Nome com timestamp: trocar a foto gera um caminho novo, então nenhuma URL
// assinada antiga (em cache) mostra a foto errada.
export async function enviarFotoCheque(ownerId: string, chequeId: string, file: File): Promise<string> {
  const blob = await comprimirFoto(file)
  const path = `${ownerId}/${chequeId}/${Date.now()}.${extensao(blob)}`
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(BUCKET_FOTOS_CHEQUE)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg' })
  if (error) throw new Error(error.message)
  return path
}

// Melhor esforço: se falhar, só sobra um arquivo órfão no bucket
export async function removerFotoCheque(path: string | null | undefined): Promise<void> {
  if (!path) return
  const supabase = createClient()
  await supabase.storage.from(BUCKET_FOTOS_CHEQUE).remove([path])
}
