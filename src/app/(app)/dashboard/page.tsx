import { serverFetchEmprestimosCalculados } from '@/lib/supabase/server-queries'
import { DashboardView } from './dashboard-view'

export default async function DashboardPage() {
  const emprestimos = await serverFetchEmprestimosCalculados()
  return <DashboardView initialEmprestimos={emprestimos} />
}
