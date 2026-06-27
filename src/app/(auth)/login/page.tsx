'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TrendingUp, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('Conta criada! Verifique seu email ou faça login.')
        setIsSignUp(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center mb-8 gap-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: 'var(--primary)' }}>
          <TrendingUp className="w-6 h-6" style={{ color: 'var(--primary-foreground)' }} />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
          Gestão de Empréstimos
        </h1>
        <p style={{ color: 'var(--muted-foreground)' }} className="text-sm text-center">
          {isSignUp ? 'Crie sua conta para começar' : 'Entre na sua conta'}
        </p>
      </div>

      <div className="rounded-2xl p-6 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" style={{ color: 'var(--muted-foreground)' }}>Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" style={{ color: 'var(--muted-foreground)' }}>Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full font-semibold mt-2"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSignUp ? 'Criar conta' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--muted-foreground)' }}>
          {isSignUp ? 'Já tem conta?' : 'Não tem conta?'}{' '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-medium underline"
            style={{ color: 'var(--primary)' }}
          >
            {isSignUp ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </div>
    </div>
  )
}
