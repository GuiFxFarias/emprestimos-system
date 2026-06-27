import {
  serverFetchClientes,
  serverFetchEmprestimosCalculados,
  serverFetchConfiguracoes,
} from '@/lib/supabase/server-queries'
import { EmprestimosView } from './emprestimos-view'

export default async function EmprestimosPage() {
  const [clientes, emprestimos, config] = await Promise.all([
    serverFetchClientes(),
    serverFetchEmprestimosCalculados(),
    serverFetchConfiguracoes(),
  ])
  return (
    <EmprestimosView
      initialClientes={clientes}
      initialEmprestimos={emprestimos}
      initialConfig={config}
    />
  )
}
