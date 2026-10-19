interface MetricCardProps {
  label: string
  value: string
  sub?: string
  // linhas de composição do valor (ex.: capital / juros / total)
  details?: { label: string; value: string }[]
  icon: React.ReactNode
  color: string
}

export function MetricCard({ label, value, sub, details, icon, color }: MetricCardProps) {
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
      {details && details.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
          {details.map(d => (
            <div key={d.label} className="flex items-center justify-between gap-2 text-xs">
              <span style={{ color: 'var(--muted-foreground)' }}>{d.label}</span>
              <span className="font-medium" style={{ color: 'var(--foreground)' }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
      {sub && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
    </div>
  )
}
