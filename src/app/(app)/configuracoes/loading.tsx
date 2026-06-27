import { Skeleton } from '@/components/ui/skeleton'
import { Settings } from 'lucide-react'

export default function ConfiguracoesLoading() {
  return (
    <div className="p-4 md:p-8 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6" style={{ color: 'var(--primary)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Configurações</h1>
      </div>

      <div className="flex flex-col gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" style={{ background: 'var(--muted)' }} />
            <Skeleton className="h-10 w-full" style={{ background: 'var(--muted)' }} />
            <Skeleton className="h-3 w-full" style={{ background: 'var(--muted)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
