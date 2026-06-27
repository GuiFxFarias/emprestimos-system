interface MetricCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  color: string
}

export function MetricCard({ label, value, sub, icon, color }: MetricCardProps) {
  return (
    <div
      className="rounded-2xl border p-4 flex flex-col gap-2"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      </div>
      <p className="text-lg font-bold leading-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
    </div>
  )
}
