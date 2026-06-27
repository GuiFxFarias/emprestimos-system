'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from 'lucide-react'

interface Props {
  fotoPath: string | null
  nome: string
  size?: number
  className?: string
}

export function ClienteAvatar({ fotoPath, nome, size = 40, className = '' }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!fotoPath) { setSrc(null); return }
    const supabase = createClient()
    supabase.storage
      .from('fotos-clientes')
      .createSignedUrl(fotoPath, 3600 * 24)
      .then(({ data }) => { if (data) setSrc(data.signedUrl) })
  }, [fotoPath])

  const initials = nome
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (src) {
    return (
      <img
        src={src}
        alt={nome}
        className={`rounded-xl object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`rounded-xl flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, background: 'var(--muted)' }}
    >
      {initials ? (
        <span
          className="font-bold select-none"
          style={{ color: 'var(--muted-foreground)', fontSize: Math.round(size * 0.32) }}
        >
          {initials}
        </span>
      ) : (
        <User style={{ width: size * 0.5, height: size * 0.5, color: 'var(--muted-foreground)' }} />
      )}
    </div>
  )
}
