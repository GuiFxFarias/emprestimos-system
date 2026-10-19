import { serverFetchCheques, serverFetchClientes } from '@/lib/supabase/server-queries'
import { ChequesView } from './cheques-view'

export default async function ChequesPage() {
  const [cheques, clientes] = await Promise.all([
    serverFetchCheques(),
    serverFetchClientes(),
  ])
  return <ChequesView initialCheques={cheques} initialClientes={clientes} />
}
