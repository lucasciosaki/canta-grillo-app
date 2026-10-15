# Diretrizes de Desenvolvimento - Canta Grillo PWA

## Segurança e Permissões por Cargo (Supabase RLS)
Sempre que implementar, refatorar ou propor uma funcionalidade que dependa de um papel, cargo ou privilégio específico (por exemplo: `role === 'admin'`, `is_lider` de frente, ou morador `ativo = true`):

1. **Garantir Segurança no Back-end (Database-first):**
   * O front-end gerencia apenas a interface e usabilidade (visibilidade de botões, modais e rotas).
   * A segurança real e autorização de leitura/escrita **deve** residir nas políticas de **Row Level Security (RLS)** do PostgreSQL no Supabase.

2. **Fornecer o Script SQL de RLS Imediatamente:**
   * Junto com as alterações de front-end, apresente o bloco SQL pronto para execução no SQL Editor do Supabase, contendo as políticas de RLS (`CREATE POLICY ...`) que validam a permissão usando `auth.uid()` (ex.: funções `public.is_admin()`, checagem de liderança em `front_members`, etc.).

3. **Manter Documentação Sincronizada:**
   * Atualizar os documentos de referência ([AGY.md](./AGY.md) e [REQUIREMENTS.md](./REQUIREMENTS.md)) refletindo quem tem permissão para ler, inserir, atualizar ou excluir a entidade.
