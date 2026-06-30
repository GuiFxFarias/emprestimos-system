import { serverFetchEmprestimosCalculados, serverFetchAllPagamentos } from '@/lib/supabase/server-queries'
import { DashboardView } from './dashboard-view'

export default async function DashboardPage() {
  const [emprestimos, pagamentos] = await Promise.all([
    serverFetchEmprestimosCalculados(),
    serverFetchAllPagamentos(),
  ])
  return <DashboardView initialEmprestimos={emprestimos} initialPagamentos={pagamentos} />
}
