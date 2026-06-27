import { serverFetchConfiguracoes } from '@/lib/supabase/server-queries'
import { ConfiguracoesView } from './configuracoes-view'

export default async function ConfiguracoesPage() {
  const config = await serverFetchConfiguracoes()
  return <ConfiguracoesView initialConfig={config} />
}
