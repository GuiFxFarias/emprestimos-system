-- Migration: bucket de storage para dumps de backup automático (ver .github/workflows/backup.yml)
-- Privado, sem policies: só a service role (usada pela GitHub Action) acessa,
-- pois ela ignora RLS por padrão. Nenhum usuário comum deve ler/escrever aqui.

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
