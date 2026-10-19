import { Skeleton } from '@/components/ui/skeleton'
import { Receipt } from 'lucide-react'

export default function ChequesLoading() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Cheques</h1>
        </div>
        <Skeleton className="h-9 w-24 rounded-xl" style={{ background: 'var(--muted)' }} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>
    </div>
  )
}
