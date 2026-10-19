import { serverFetchEmprestimosCalculados, serverFetchAllPagamentos, serverFetchCheques } from '@/lib/supabase/server-queries'
import { DashboardView } from './dashboard-view'

export default async function DashboardPage() {
  const [emprestimos, pagamentos, cheques] = await Promise.all([
    serverFetchEmprestimosCalculados(),
    serverFetchAllPagamentos(),
    serverFetchCheques(),
  ])
  return <DashboardView initialEmprestimos={emprestimos} initialPagamentos={pagamentos} initialCheques={cheques} />
}
