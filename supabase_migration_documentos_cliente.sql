-- ================================================================
-- MIGRAÇÃO: Documentos do cliente (CNH, comprovante de residência, holerite)
-- Adiciona 3 colunas em 'clientes' (caminho do arquivo no Storage) e cria o
-- bucket privado 'documentos-clientes'. Cada usuário só acessa a própria
-- pasta (owner_id/cliente_id/arquivo).
-- Só ADICIONA colunas/bucket; não altera nenhum dado existente.
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cnh_url text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS comprovante_residencia_url text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS holerite_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-clientes', 'documentos-clientes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documentos_clientes_select_own" ON storage.objects;
DROP POLICY IF EXISTS "documentos_clientes_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "documentos_clientes_update_own" ON storage.objects;
DROP POLICY IF EXISTS "documentos_clientes_delete_own" ON storage.objects;

CREATE POLICY "documentos_clientes_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documentos-clientes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "documentos_clientes_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documentos-clientes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "documentos_clientes_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documentos-clientes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "documentos_clientes_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documentos-clientes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
