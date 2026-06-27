import { Skeleton } from '@/components/ui/skeleton'
import { HandCoins } from 'lucide-react'

export default function EmprestimosLoading() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Empréstimos</h1>
        </div>
        <Skeleton className="h-9 w-24 rounded-xl" style={{ background: 'var(--muted)' }} />
      </div>

      <Skeleton className="h-10 w-full rounded-xl mb-4" style={{ background: 'var(--muted)' }} />

      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>
    </div>
  )
}
