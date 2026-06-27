import { serverFetchClientes, serverFetchEmprestimosCalculados } from '@/lib/supabase/server-queries'
import { ClientesView } from './clientes-view'

export default async function ClientesPage() {
  const [clientes, emprestimos] = await Promise.all([
    serverFetchClientes(),
    serverFetchEmprestimosCalculados(),
  ])
  return <ClientesView initialClientes={clientes} initialEmprestimos={emprestimos} />
}
