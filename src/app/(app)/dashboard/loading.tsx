import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp } from 'lucide-react'

export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-6 h-6" style={{ color: 'var(--primary)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Skeleton className="h-52 rounded-2xl" style={{ background: 'var(--muted)' }} />
        <Skeleton className="h-52 rounded-2xl" style={{ background: 'var(--muted)' }} />
      </div>

      <Skeleton className="h-48 rounded-2xl" style={{ background: 'var(--muted)' }} />
    </div>
  )
}
