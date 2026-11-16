-- ================================================================
-- MIGRAÇÃO: Foto do cheque
-- Adiciona a coluna 'foto_url' em 'cheques' (caminho do arquivo no Storage)
-- e cria o bucket privado 'fotos-cheques'. Cada usuário só acessa a própria
-- pasta (owner_id/cheque_id/arquivo.jpg).
-- Só ADICIONA coluna/bucket; não altera nenhum dado existente.
-- Cole este SQL no SQL Editor do Supabase e execute.
-- ================================================================

ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS foto_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-cheques', 'fotos-cheques', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fotos_cheques_select_own" ON storage.objects;
DROP POLICY IF EXISTS "fotos_cheques_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "fotos_cheques_update_own" ON storage.objects;
DROP POLICY IF EXISTS "fotos_cheques_delete_own" ON storage.objects;

CREATE POLICY "fotos_cheques_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fotos-cheques'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "fotos_cheques_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'fotos-cheques'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "fotos_cheques_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'fotos-cheques'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "fotos_cheques_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'fotos-cheques'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
