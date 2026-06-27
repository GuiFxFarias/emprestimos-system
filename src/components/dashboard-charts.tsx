'use client'

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatBRL } from '@/lib/format'

interface DonutItem {
  name: string
  value: number
  color: string
}

interface BarItem {
  mes: string
  total: number
}

export function DonutChart({ data }: { data: DonutItem[] }) {
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={35} outerRadius={55} paddingAngle={3}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span style={{ color: 'var(--muted-foreground)' }}>{d.name}</span>
            <span className="font-semibold ml-auto pl-2" style={{ color: 'var(--foreground)' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BarChartMensal({ data }: { data: BarItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}
          labelStyle={{ color: 'var(--foreground)', fontSize: 12 }}
          itemStyle={{ color: 'var(--primary)', fontSize: 12 }}
          formatter={(v) => [formatBRL(Number(v ?? 0)), 'Capital']}
        />
        <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
