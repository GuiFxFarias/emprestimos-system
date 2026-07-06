import {
  serverFetchClientes,
  serverFetchEmprestimosCalculados,
  serverFetchConfiguracoes,
  serverFetchAllPagamentos,
} from '@/lib/supabase/server-queries'
import { EmprestimosView } from './emprestimos-view'

export default async function EmprestimosPage() {
  const [clientes, emprestimos, config, pagamentos] = await Promise.all([
    serverFetchClientes(),
    serverFetchEmprestimosCalculados(),
    serverFetchConfiguracoes(),
    serverFetchAllPagamentos(),
  ])
  return (
    <EmprestimosView
      initialClientes={clientes}
      initialEmprestimos={emprestimos}
      initialConfig={config}
      initialPagamentos={pagamentos}
    />
  )
}
