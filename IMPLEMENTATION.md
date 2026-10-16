# Plano de Execução e Implementação Detalhado — Sistema Geral de Funças & Reunião Semanal (`feature/funcas`)

> **Documento Guia de Implementação para Agentes / Modelos de IA**  
> **Branch:** `feature/funcas`  
> **Diretório de Trabalho Obrigatório:** `/home/ciosaki/hd/canta-grillo-app/.worktrees/funcas/`  
> **Referências:** [AGY.md](./AGY.md) (Fase 4), [REQUIREMENTS.md](./REQUIREMENTS.md) (RN09), [GEMINI.md](./GEMINI.md) (Database-First RLS)

---

## 0. Restrições Globais Obrigatórias (LEIA ANTES DE INICIAR)

1. **Isolamento de Worktree:**
   - **TODA** leitura, criação e edição de arquivos, bem como **TODA** execução de comandos (`run_command`, `npm test`, `npm run build`, etc.) **DEVE** ocorrer estritamente dentro de:
     ```bash
     /home/ciosaki/hd/canta-grillo-app/.worktrees/funcas/
     ```
   - Nunca edite arquivos na raiz `/home/ciosaki/hd/canta-grillo-app/` fora de `.worktrees/funcas/`.

2. **Diretriz Database-First (`GEMINI.md`):**
   - A segurança real deve residir no PostgreSQL/Supabase via **Row Level Security (RLS)** e funções `SECURITY DEFINER`.
   - Ao concluir a implementação, apresente também na resposta final o bloco SQL completo pronto para execução no SQL Editor do Supabase.
   - Atualize [AGY.md](./AGY.md) e [REQUIREMENTS.md](./REQUIREMENTS.md) refletindo as políticas RLS e regras implementadas.

3. **Identificação Estrita por Apelido:**
   - Em **todas** as telas, cards, seletores (`<select>`), badges de responsáveis, relatores, autores de atribuição e pedidos de troca, exiba **estritamente o `apelido`** do morador (`profile.apelido || profile.nome?.split(' ')[0] || 'Morador'`). Nunca exiba o nome civil completo se houver apelido.

4. **Design System Editorial / Warm Paper:**
   - Mantenha rigorosamente a estética do app (`bg-paper`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-forest`, `text-forest`, `bg-mint`, `bg-clay-tint`, `text-clay`).
   - Reutilize os componentes de [`src/components/ui.tsx`](./src/components/ui.tsx) (`PageTitle`, `Section`, `Row`, `Tag`, `Button`) e ícones do pacote `lucide-react`.

---

## 1. Especificação Funcional e Regras de Negócio Consolidadas

### 1.1 Conceito e Escopo da Funça (`public.funcas`)
- Toda tarefa, reparo ou missão da casa é uma **Funça**.
- **Campos:**
  - `id` (UUID, PK)
  - `frente_id` (UUID, FK opcional para `public.fronts(id)`):
    - `NULL` $\rightarrow$ **Funça Geral** da casa.
    - `NOT NULL` $\rightarrow$ **Funça de Frente** (vinculada a uma das 10 frentes).
  - `relator_id` (UUID, FK para `public.profiles(id)`): Morador ativo ou Admin que abriu a funça.
  - `titulo` (TEXT, obrigatório)
  - `descricao` (TEXT, obrigatório — no lançamento rápido em lote da reunião semanal, se deixado em branco, usar fallback `''` ou repetir o título).
  - `foto_url` (TEXT, opcional): Imagem comprimida no cliente (máx 1024px, JPEG qualidade 0.75) enviada ao bucket `'funcas'` do Supabase Storage, com fallback automático para `data:image/jpeg;base64,...` caso o bucket não exista.
  - `status` (TEXT): `'aberta'`, `'em_andamento'`, `'concluida'`.
  - `prazo` (DATE, opcional).
  - `created_at` (TIMESTAMPTZ).

### 1.2 Múltiplos Responsáveis (`public.funca_atribuicoes`)
- Uma Funça pode ter **0, 1 ou múltiplos moradores atribuídos simultaneamente** (ex.: dupla de bixos ou múltiplos membros de uma frente).
- Chave primária composta natural: `PRIMARY KEY (funca_id, morador_id)`.
- **Tipos de atribuição (`tipo_atribuicao`):**
  - `'autoatribuicao'`: O próprio morador puxou a funça para si.
  - `'lider_frente'`: Líder da frente atribuiu a um integrante da mesma frente.
  - `'veterano_bixo'`: Veterano atribuiu uma Funça Geral a um bixo seu.
  - `'admin_geral'`: Administrador atribuiu a funça.
  - `'reuniao'`: Alocação feita no Painel Centralizado da Reunião Semanal.
  - `'troca'`: Responsabilidade transferida após aceite de uma solicitação de troca entre moradores.

### 1.3 Ciclo de Vida Manual em 3 Etapas (`status`)
- **Regra:** Atribuir 1 ou mais responsáveis a uma funça **NÃO** altera seu status automaticamente para `'em_andamento'`.
- O ciclo de vida é **manual em 3 etapas**:
  1. **`'aberta'`**: Estado inicial da funça (esteja ela sem dono ou já atribuída a 1+ moradores aguardando início).
  2. **`'em_andamento'`**: O responsável (ou autorizado) clica no botão **"Iniciar (Em andamento)"** quando começa a executar a tarefa.
  3. **`'concluida'`**: Ao finalizar, clica no botão **"Concluir"** (1 toque simples, sem exigir foto de comprovação).
- **Quem pode alterar o status para `'em_andamento'` ou `'concluida'`:**
  - Qualquer um dos **responsáveis atribuídos** à funça (`morador_id = user.id`);
  - O **Líder da Frente** correspondente (quando `frente_id IS NOT NULL`);
  - O **Veterano** que atribuiu a tarefa (`atribuido_por = user.id`) ou que seja veterano de algum responsável;
  - O **Relator** que abriu a funça (`relator_id = user.id`);
  - O **Administrador** (`role === 'admin'`).

### 1.4 Matriz de Permissões de Atribuição
1. **Funça de Frente (`frente_id IS NOT NULL`):**
   - **Líder da Frente** (`is_lider = true` naquela frente): pode atribuir a qualquer integrante daquela frente (`tipo_atribuicao = 'lider_frente'`).
   - **Integrante da Frente**: pode se **autoatribuir** (`morador_id = user.id`, `tipo_atribuicao = 'autoatribuicao'`). Moradores que não pertencem à frente não podem usar autoatribuição normal nela.
   - **Administrador** (`role === 'admin'`): pode atribuir a qualquer morador ativo da casa (`tipo_atribuicao = 'admin_geral'`).
2. **Funça Geral (`frente_id IS NULL`):**
   - **Qualquer Veterano ativo**: pode atribuir **qualquer Funça Geral pendente** (mesmo que aberta por outro morador) para qualquer **bixo seu** (`geracao_num(veterano) < geracao_num(bixo)`, ex.: `'024'` atribui para `'025'` ou `'026'`), com `tipo_atribuicao = 'veterano_bixo'`.
   - **Administrador** (`role === 'admin'`): pode atribuir a qualquer morador ativo (`tipo_atribuicao = 'admin_geral'`).
   - **Qualquer morador ativo**: pode se **autoatribuir** (`morador_id = user.id`, `tipo_atribuicao = 'autoatribuicao'`).
3. **Painel da Reunião Semanal (`tipo_atribuicao = 'reuniao'`):**
   - **Qualquer morador ativo** (ou Admin) operando a aba `Reunião Semanal` pode alocar **qualquer funça** (Geral ou de Frente) para **qualquer morador ativo da casa**, definir/alterar `prazo` e criar múltiplas funças em lote com `tipo_atribuicao = 'reuniao'`.

### 1.5 Remoção de Responsável vs. Solicitação de Troca
1. **Remoção Direta (`DELETE` em `public.funca_atribuicoes`):**
   - Um morador atribuído **NÃO** pode simplesmente remover a si mesmo de uma funça.
   - Apenas podem remover um responsável de uma funça:
     - **Administrador** (`role === 'admin'`);
     - **Líder da Frente** da funça (se `frente_id IS NOT NULL`);
     - **Veterano do morador atribuído** (`geracao_num(usuario) < geracao_num(responsavel_atribuido)`) — **IMPORTANTE:** o veterano do morador atribuído pode removê-lo **tanto em Funça Geral quanto em Funça de Frente**.
2. **Solicitação de Troca com Outro Morador:**
   - O responsável atual (`morador_id = user.id`) pode clicar em **"Pedir Troca"** e selecionar **qualquer morador ativo da casa** (independente de a funça ser Geral ou de Frente, desde que o alvo ainda não seja responsável na mesma funça).
   - Isso grava `troca_solicitada_para = <alvo_id>` e `troca_solicitada_em = NOW()` na linha de `public.funca_atribuicoes`.
   - Enquanto a troca estiver pendente:
     - O solicitante vê o status `"Troca enviada p/ [Apelido]"` e pode cancelar o pedido (`troca_solicitada_para = null`).
     - O morador destinatário vê um alerta em destaque na aba `Minhas` (e na Home) com dois botões:
       - **Aceitar Troca**: executa a função RPC `public.aceitar_troca_funca(p_funca_id, p_morador_origem_id)` (ou substitui a atribuição no banco), fazendo com que o morador origem saia da funça e o destinatário assuma com `tipo_atribuicao = 'troca'`.
       - **Recusar Troca**: limpa `troca_solicitada_para = null` e `troca_solicitada_em = null`, mantendo a funça com o responsável original.

---

## 2. Passo a Passo de Execução

### PASSO 1: Atualizar `supabase/schema.sql` (Tabelas, Funções, RPC e RLS)

Edite o arquivo [`supabase/schema.sql`](./supabase/schema.sql) dentro de `.worktrees/funcas/`:

1. **Na definição da tabela `public.funca_atribuicoes` (por volta da linha 188):**
   Atualize a tabela para incluir `'troca'` no `CHECK` de `tipo_atribuicao` e as colunas de solicitação de troca (incluindo `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para compatibilidade com bancos já criados):

```sql
-- 13. ATRIBUIÇÃO DE FUNÇAS (Suporta múltiplos responsáveis e Solicitação de Troca)
CREATE TABLE IF NOT EXISTS public.funca_atribuicoes (
    funca_id UUID NOT NULL REFERENCES public.funcas(id) ON DELETE CASCADE,
    morador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    atribuido_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    tipo_atribuicao TEXT NOT NULL CHECK (tipo_atribuicao IN ('autoatribuicao', 'lider_frente', 'veterano_bixo', 'admin_geral', 'reuniao', 'troca')),
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    troca_solicitada_para UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    troca_solicitada_em TIMESTAMPTZ,
    PRIMARY KEY (funca_id, morador_id)
);

-- Garantir colunas e constraint atualizada caso a tabela já exista no banco
ALTER TABLE public.funca_atribuicoes ADD COLUMN IF NOT EXISTS troca_solicitada_para UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.funca_atribuicoes ADD COLUMN IF NOT EXISTS troca_solicitada_em TIMESTAMPTZ;
ALTER TABLE public.funca_atribuicoes DROP CONSTRAINT IF EXISTS funca_atribuicoes_tipo_atribuicao_check;
ALTER TABLE public.funca_atribuicoes ADD CONSTRAINT funca_atribuicoes_tipo_atribuicao_check
    CHECK (tipo_atribuicao IN ('autoatribuicao', 'lider_frente', 'veterano_bixo', 'admin_geral', 'reuniao', 'troca'));
```

2. **Ao final do arquivo [`supabase/schema.sql`](./supabase/schema.sql), adicione a seção 7 com as funções auxiliares, RPC de troca, políticas RLS e Realtime:**

```sql
-- ==============================================================================
-- 7. SISTEMA GERAL DE FUNÇAS E REUNIÃO SEMANAL: HELPERS, RPC DE TROCA E RLS
-- ==============================================================================

-- Extrai o número inteiro de uma geração (ex: '024' -> 24, '025' -> 25)
CREATE OR REPLACE FUNCTION public.geracao_num(p_geracao TEXT)
RETURNS INT AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_geracao IS NULL THEN
    RETURN NULL;
  END IF;
  v_clean := NULLIF(REGEXP_REPLACE(p_geracao, '\D', '', 'g'), '');
  IF v_clean IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_clean::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Verifica se p_veterano_id é veterano de p_bixo_id (geracao menor = mais antigo na casa)
CREATE OR REPLACE FUNCTION public.is_veterano_de(p_veterano_id UUID, p_bixo_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles vet
    JOIN public.profiles bixo ON bixo.id = p_bixo_id
    WHERE vet.id = p_veterano_id
      AND vet.ativo = true
      AND vet.role IN ('morador', 'admin')
      AND bixo.ativo = true
      AND public.geracao_num(vet.geracao) IS NOT NULL
      AND public.geracao_num(bixo.geracao) IS NOT NULL
      AND public.geracao_num(vet.geracao) < public.geracao_num(bixo.geracao)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Verifica se o usuário é líder de uma frente específica
CREATE OR REPLACE FUNCTION public.is_lider_frente(p_frente_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.front_members fm
    JOIN public.profiles p ON p.id = fm.profile_id
    WHERE fm.front_id = p_frente_id
      AND fm.profile_id = p_user_id
      AND fm.is_lider = true
      AND p.ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Verifica se o usuário é integrante (membro ou líder) de uma frente específica
CREATE OR REPLACE FUNCTION public.is_membro_frente(p_frente_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.front_members fm
    JOIN public.profiles p ON p.id = fm.profile_id
    WHERE fm.front_id = p_frente_id
      AND fm.profile_id = p_user_id
      AND p.ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- RPC Transacional para Aceitar Solicitação de Troca de Funça
CREATE OR REPLACE FUNCTION public.aceitar_troca_funca(p_funca_id UUID, p_morador_origem_id UUID)
RETURNS VOID AS $$
DECLARE
  v_alvo_id UUID;
BEGIN
  SELECT troca_solicitada_para INTO v_alvo_id
  FROM public.funca_atribuicoes
  WHERE funca_id = p_funca_id AND morador_id = p_morador_origem_id;

  IF v_alvo_id IS NULL OR v_alvo_id <> auth.uid() THEN
    RAISE EXCEPTION 'Nenhuma solicitação de troca pendente para o seu usuário nesta funça.';
  END IF;

  -- Remove a atribuição do solicitante original
  DELETE FROM public.funca_atribuicoes
  WHERE funca_id = p_funca_id AND morador_id = p_morador_origem_id;

  -- Insere o morador que aceitou a troca (se ainda não estiver atribuído na mesma funça)
  INSERT INTO public.funca_atribuicoes (
    funca_id,
    morador_id,
    atribuido_por,
    tipo_atribuicao,
    atribuido_em,
    troca_solicitada_para,
    troca_solicitada_em
  ) VALUES (
    p_funca_id,
    auth.uid(),
    p_morador_origem_id,
    'troca',
    NOW(),
    NULL,
    NULL
  )
  ON CONFLICT (funca_id, morador_id) DO UPDATE SET
    troca_solicitada_para = NULL,
    troca_solicitada_em = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS nas tabelas funcas e funca_atribuicoes
ALTER TABLE public.funcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funca_atribuicoes ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS EM public.funcas
DROP POLICY IF EXISTS "Leitura de funcas para moradores ativos" ON public.funcas;
CREATE POLICY "Leitura de funcas para moradores ativos"
ON public.funcas FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Abertura de funcas por moradores ativos" ON public.funcas;
CREATE POLICY "Abertura de funcas por moradores ativos"
ON public.funcas FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND relator_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Atualizacao de funcas por moradores ativos" ON public.funcas;
CREATE POLICY "Atualizacao de funcas por moradores ativos"
ON public.funcas FOR UPDATE
TO authenticated
USING (public.is_admin() OR public.is_active_morador())
WITH CHECK (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Exclusao de funcas por admin, lider, veterano ou relator" ON public.funcas;
CREATE POLICY "Exclusao de funcas por admin, lider, veterano ou relator"
ON public.funcas FOR DELETE
TO authenticated
USING (
  public.is_admin() OR (
    public.is_active_morador() AND (
      relator_id = auth.uid() OR
      (frente_id IS NOT NULL AND public.is_lider_frente(frente_id, auth.uid()))
    )
  )
);

-- POLÍTICAS EM public.funca_atribuicoes
DROP POLICY IF EXISTS "Leitura de atribuicoes de funcas" ON public.funca_atribuicoes;
CREATE POLICY "Leitura de atribuicoes de funcas"
ON public.funca_atribuicoes FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Insercao de atribuicoes de funcas com regras RN09" ON public.funca_atribuicoes;
CREATE POLICY "Insercao de atribuicoes de funcas com regras RN09"
ON public.funca_atribuicoes FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND
    atribuido_por = auth.uid() AND (
      -- 1. Modo Reunião Semanal: qualquer morador ativo secretariando pode alocar
      tipo_atribuicao = 'reuniao'
      OR
      -- 2. Regras para Funça de Frente vs Funça Geral
      EXISTS (
        SELECT 1 FROM public.funcas f
        WHERE f.id = funca_id AND (
          -- Funça de Frente (frente_id IS NOT NULL)
          (
            f.frente_id IS NOT NULL AND (
              (tipo_atribuicao = 'lider_frente' AND public.is_lider_frente(f.frente_id, auth.uid()) AND public.is_membro_frente(f.frente_id, morador_id))
              OR
              (tipo_atribuicao = 'autoatribuicao' AND morador_id = auth.uid() AND public.is_membro_frente(f.frente_id, auth.uid()))
            )
          )
          OR
          -- Funça Geral (frente_id IS NULL)
          (
            f.frente_id IS NULL AND (
              (tipo_atribuicao = 'veterano_bixo' AND public.is_veterano_de(auth.uid(), morador_id))
              OR
              (tipo_atribuicao = 'autoatribuicao' AND morador_id = auth.uid())
            )
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "Atualizacao de atribuicao para solicitacao de troca" ON public.funca_atribuicoes;
CREATE POLICY "Atualizacao de atribuicao para solicitacao de troca"
ON public.funca_atribuicoes FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR (
    public.is_active_morador() AND (
      morador_id = auth.uid() OR
      troca_solicitada_para = auth.uid() OR
      public.is_veterano_de(auth.uid(), morador_id)
    )
  )
)
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND (
      morador_id = auth.uid() OR
      troca_solicitada_para = auth.uid() OR
      troca_solicitada_para IS NULL OR
      public.is_veterano_de(auth.uid(), morador_id)
    )
  )
);

DROP POLICY IF EXISTS "Remocao de atribuicao restrita a admin, lider ou veterano" ON public.funca_atribuicoes;
CREATE POLICY "Remocao de atribuicao restrita a admin, lider ou veterano"
ON public.funca_atribuicoes FOR DELETE
TO authenticated
USING (
  public.is_admin() OR (
    public.is_active_morador() AND (
      -- Veterano do morador atribuído pode removê-lo (inclusive em Funça de Frente)
      public.is_veterano_de(auth.uid(), morador_id)
      OR
      -- Líder da frente da funça pode remover responsáveis daquela funça
      EXISTS (
        SELECT 1 FROM public.funcas f
        WHERE f.id = funca_id
          AND f.frente_id IS NOT NULL
          AND public.is_lider_frente(f.frente_id, auth.uid())
      )
    )
  )
);

-- Habilita Realtime para funcas e funca_atribuicoes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'funcas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.funcas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'funca_atribuicoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.funca_atribuicoes;
  END IF;
END $$;
```

---

### PASSO 2: Criar `src/types/funcas.ts` (Tipos e Funções Puras de Negócio)

Crie o arquivo `.worktrees/funcas/src/types/funcas.ts` contendo todas as interfaces e funções puras de validação (que serão usadas tanto na UI quanto nos testes automatizados em `tests/unit/funcas-logic.test.mjs`).

**Requisitos obrigatórios de `src/types/funcas.ts`:**
- **Tipos:**
  - `StatusFunca = 'aberta' | 'em_andamento' | 'concluida'`
  - `TipoAtribuicaoFunca = 'autoatribuicao' | 'lider_frente' | 'veterano_bixo' | 'admin_geral' | 'reuniao' | 'troca'`
  - `PerfilResumoFunca`: `{ id: string; nome: string; apelido: string | null; role?: 'admin' | 'morador' | 'externo'; ativo?: boolean; geracao?: string | null }`
  - `FuncaAtribuicao`:
    - `funca_id: string`
    - `morador_id: string`
    - `atribuido_por: string | null`
    - `tipo_atribuicao: TipoAtribuicaoFunca`
    - `atribuido_em: string`
    - `troca_solicitada_para?: string | null`
    - `troca_solicitada_em?: string | null`
    - `morador?: PerfilResumoFunca | null`
    - `autor_atribuicao?: PerfilResumoFunca | null`
    - `alvo_troca?: PerfilResumoFunca | null`
  - `Funca`:
    - `id: string`
    - `frente_id: string | null`
    - `relator_id: string`
    - `titulo: string`
    - `descricao: string`
    - `foto_url: string | null`
    - `status: StatusFunca`
    - `prazo: string | null`
    - `created_at: string`
    - `frente?: { id: string; nome: string; slug: string } | null`
    - `relator?: PerfilResumoFunca | null`
    - `atribuicoes: FuncaAtribuicao[]`
- **Funções Puras Exportadas:**
  1. `obterApelidoMorador(perfil?: { nome?: string | null; apelido?: string | null } | null): string`
     - Retorna `perfil.apelido.trim()` se existir e não for vazio; caso contrário `perfil.nome?.trim().split(' ')[0]` ou `'Morador'`.
  2. `parseGeracaoNumero(geracao?: string | null): number | null`
     - Extrai os dígitos da string (ex.: `'024'` $\rightarrow$ `24`, `'026'` $\rightarrow$ `26`). Se não houver dígitos, retorna `null`.
  3. `isVeteranoDe(veterano?: PerfilResumoFunca | null, bixo?: PerfilResumoFunca | null): boolean`
     - Retorna `true` se ambos existirem, `veterano.id !== bixo.id`, ambos tiverem geração numérica válida e `genVet < genBixo`.
  4. `isLiderDaFrente(userId: string, frenteId: string | null, membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>): boolean`
  5. `isMembroDaFrente(userId: string, frenteId: string | null, membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>): boolean`
  6. `verificarPermissaoAtribuicao(params: { autor: PerfilResumoFunca; alvo: PerfilResumoFunca; frenteId: string | null; membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>; modoReuniao?: boolean }): { permitido: boolean; tipoAtribuicao: TipoAtribuicaoFunca | null; motivo?: string }`
     - Implementa fielmente a Matriz de Permissões da Seção 1.4:
       - Se `autor.ativo === false` ou `alvo.ativo === false` ou `autor.role === 'externo'` ou `alvo.role === 'externo'`, retorna `{ permitido: false, tipoAtribuicao: null }`.
       - Se `modoReuniao === true`: qualquer morador ativo ou admin pode atribuir para qualquer morador ativo com `tipoAtribuicao: 'reuniao'`.
       - Se `autor.role === 'admin'`: retorna `{ permitido: true, tipoAtribuicao: 'admin_geral' }`.
       - Se `frenteId !== null` (**Funça de Frente**):
         - Se `autor.id === alvo.id` e `isMembroDaFrente(autor.id, frenteId, membrosFrentes)` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'autoatribuicao' }`.
         - Se `isLiderDaFrente(autor.id, frenteId, membrosFrentes)` e `isMembroDaFrente(alvo.id, frenteId, membrosFrentes)` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'lider_frente' }`.
         - Caso contrário $\rightarrow$ `{ permitido: false, tipoAtribuicao: null }`.
       - Se `frenteId === null` (**Funça Geral**):
         - Se `autor.id === alvo.id` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'autoatribuicao' }`.
         - Se `isVeteranoDe(autor, alvo)` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'veterano_bixo' }`.
         - Caso contrário $\rightarrow$ `{ permitido: false, tipoAtribuicao: null }`.
  7. `podeRemoverResponsavel(params: { usuario: PerfilResumoFunca; atribuicao: { morador_id: string; morador?: PerfilResumoFunca | null }; frenteId: string | null; membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }> }): boolean`
     - Implementa a Seção 1.5:
       - Retorna `true` se `usuario.role === 'admin'`;
       - Retorna `true` se `frenteId !== null` e `isLiderDaFrente(usuario.id, frenteId, membrosFrentes)`;
       - Retorna `true` se `isVeteranoDe(usuario, atribuicao.morador)` (funciona **inclusive em Funça de Frente**!).
       - Caso contrário retorna `false` (o próprio responsável comum **não** pode se remover diretamente; deve pedir troca).
  8. `podeSolicitarTroca(params: { usuarioId: string; atribuicao: { morador_id: string }; alvo: PerfilResumoFunca; atribuicoesAtuaisIds: string[] }): boolean`
     - Retorna `true` se `usuarioId === atribuicao.morador_id`, `alvo.id !== usuarioId`, `alvo.ativo !== false`, `alvo.role !== 'externo'` e `!atribuicoesAtuaisIds.includes(alvo.id)` (pode pedir troca para qualquer morador ativo da casa, seja Funça Geral ou de Frente).
  9. `podeAvancarStatusFunca(params: { usuario: PerfilResumoFunca; funca: { relator_id: string; frente_id: string | null }; atribuicoes: Array<{ morador_id: string; atribuido_por: string | null; morador?: PerfilResumoFunca | null }>; membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }> }): boolean`
     - Retorna `true` se o usuário for Admin, Relator, um dos responsáveis atribuídos, Líder da frente da funça, quem atribuiu (`atribuido_por === usuario.id`) ou veterano de algum responsável.
  10. ` obterProximoStatusManual(statusAtual: StatusFunca): StatusFunca | null`
      - `'aberta'` $\rightarrow$ `'em_andamento'`
      - `'em_andamento'` $\rightarrow$ `'concluida'`
      - `'concluida'` $\rightarrow$ `null`

---

### PASSO 3: Criar `src/features/funcas/NovaFuncaModal.tsx` (Abertura Individual de Funça)

Crie `.worktrees/funcas/src/features/funcas/NovaFuncaModal.tsx` com:
- **Props:**
  - `isOpen: boolean`
  - `onClose: () => void`
  - `onSuccess: () => void`
  - `frentes: Front[]`
  - `membrosFrentes: FrontMember[]`
  - `todosMoradores: Profile[]`
  - `initialFrontId?: string | null` (se aberto de dentro de uma Frente específica, já pré-seleciona aquela Frente)
- **Campos do Formulário:**
  1. **Título da Funça** (`required`, ex.: *"Trocar resistência do chuveiro"*, *"Comprar cloro"*).
  2. **Descrição / Detalhes** (`required`).
  3. **Escopo da Funça**: Seletor entre `Geral (Casa toda)` (`frente_id = null`) ou qualquer uma das `10 Frentes`.
  4. **Prazo Opcional** (`<input type="date" />`).
  5. **Foto Opcional**: Captura/upload com compressão client-side (mesmo algoritmo `comprimirImagemParaDataUrl` de [`DenunciaPontoScreen.tsx`](./src/features/pontos/DenunciaPontoScreen.tsx) — canvas max 1024px, JPEG 0.75, tentando upload no bucket `'funcas'` e fazendo fallback para Data URL base64).
  6. **Atribuir Responsáveis Agora (Opcional, Múltipla Seleção):**
     - Lista os moradores ativos para os quais o usuário logado tem permissão de atribuir naquele escopo (calculado via `verificarPermissaoAtribuicao`), exibindo **estritamente o apelido** + tag do tipo de vínculo (ex.: `Você (Autoatribuir)`, `Bixo 026`, `Membro da Frente`).
     - Permite selecionar 0, 1 ou mais responsáveis com checkboxes/pills.
- **Comportamento ao Salvar:**
  - Insere a funça em `public.funcas` com **`status: 'aberta'`** (mesmo que já tenha responsáveis selecionados, pois o início é manual em 3 etapas!).
  - Se houver responsáveis selecionados, insere os registros correspondentes em `public.funca_atribuicoes` com o respectivo `tipo_atribuicao`.

---

### PASSO 4: Criar `src/features/funcas/FuncasScreen.tsx` (3 Abas + Trocas + Reunião Semanal)

Crie `.worktrees/funcas/src/features/funcas/FuncasScreen.tsx`:

#### 4.1 Estrutura de Abas Superiores
Três abas selecionáveis no topo da tela:
1. **`Minhas`** (com badge do total de funças ativas atribuídas a você + pedidos de troca recebidos)
2. **`Todas`** (visão geral da casa e por frente)
3. **`Reunião Semanal`** (painel de triagem coletiva das sem dono/pendentes + criação rápida em lote)

#### 4.2 Funcionalidades da Aba `Minhas`
1. **Seção de Pedidos de Troca Recebidos (Quando `troca_solicitada_para === user.id`):**
   - Exibe um card de destaque (`bg-cream` / `border-forest`) informando:
     `"[Apelido do solicitante] pediu para trocar a funça '[Título da Funça]' com você."`
   - Botões: **Aceitar Troca** (chama `supabase.rpc('aceitar_troca_funca', { p_funca_id, p_morador_origem_id })`, com fallback client-side caso a RPC ainda não esteja aplicada no banco remoto) e **Recusar** (faz `update({ troca_solicitada_para: null, troca_solicitada_em: null })`).
2. **Lista de Funças Atribuídas a Você (`aberta` e `em_andamento`):**
   - Card da funça mostrando:
     - Tag de Escopo (`Geral` ou nome da `Frente`), Tag de Status (`Aberta` ou `Em andamento`), Prazo (se houver), Apelido de quem abriu e apelidos de todos os responsáveis atribuídos.
     - Foto ilustrativa (se houver, expansível ao toque).
     - **Botão de Etapa Manual (3 etapas):**
       - Se `status === 'aberta'` $\rightarrow$ Botão **"Iniciar (Em andamento)"** (atualiza `status = 'em_andamento'`).
       - Se `status === 'em_andamento'` $\rightarrow$ Botão **"Concluir Funça"** (atualiza `status = 'concluida'`).
     - **Controle de Solicitação de Troca:**
       - Se não houver troca pendente na sua atribuição: botão **"Pedir Troca"** que abre um seletor inline com todos os moradores ativos da casa (exibindo apelido + geração) para enviar o pedido.
       - Se já houver troca pendente enviada por você: badge `"Aguardando aceite de [Apelido]"` + botão `"Cancelar pedido"`.
3. **Seção Recolhível de Concluídas por Você.**

#### 4.3 Funcionalidades da Aba `Todas`
- **Filtros:**
  - Filtro de Escopo: `Todas`, `Gerais`, ou seleção de uma `Frente` específica (já inicializado caso `initialFrontId` seja recebido via props).
  - Filtro de Status: `Pendentes (Abertas + Em andamento)` vs `Concluídas`.
- **Ações em cada Card de Funça:**
  - **Botão "Puxar p/ mim" (Autoatribuição):** Visível se o usuário ainda não está atribuído e `verificarPermissaoAtribuicao` permite autoatribuição (qualquer morador em Funça Geral, ou membro da frente em Funça de Frente).
  - **Botão "+ Atribuir":** Visível se o usuário pode atribuir a terceiros (Veterano para seus bixos em Funça Geral, Líder para membros na sua Frente, ou Admin para qualquer morador). Abre um seletor inline listando os moradores permitidos pelo apelido.
  - **Remoção de Responsável (`×` ao lado do apelido do responsável):**
    - Visível **exclusivamente** se `podeRemoverResponsavel` retornar `true` (Admin, Líder da Frente, ou Veterano daquele responsável — inclusive em Funça de Frente).
  - **Botões de Status (`Iniciar` / `Concluir`):** Visíveis para quem tem `podeAvancarStatusFunca`.

#### 4.4 Funcionalidades da Aba `Reunião Semanal`
Projetada especificamente para dar agilidade durante a reunião semanal da república (operável por qualquer morador ativo):
1. **Bloco 1 — Criação Rápida de Múltiplas Funças em Lote (Linhas Dinâmicas):**
   - Uma grade/lista de linhas compactas onde cada linha possui:
     - `Título da funça` (input texto — pressionar `Enter` adiciona automaticamente uma nova linha abaixo);
     - `Escopo` (`<select>`: `Geral` ou uma das `10 Frentes`);
     - `Prazo` (`<input type="date">`, opcional);
     - `Responsáveis` (seletor rápido permitindo escolher 1 ou mais moradores ativos pelo apelido);
     - Botão remover linha (`Trash2`).
   - Botões de ação do bloco:
     - **`+ Adicionar linha`** (adiciona mais uma linha em branco);
     - **`Lançar todas na Reunião (N)`** (insere todas as linhas preenchidas em `public.funcas` com `status = 'aberta'` e cria as respectivas atribuições em `public.funca_atribuicoes` com `tipo_atribuicao = 'reuniao'`).
2. **Bloco 2 — Fila de Triagem de Funças Pendentes (Foco nas Sem Dono):**
   - Filtro rápido: `Sem dono (${count})` (padrão/destaque) | `Todas as pendentes (${total})`.
   - Para cada funça pendente na fila:
     - Permite **alocar rapidamente 1 ou mais moradores ativos** (qualquer morador da casa, gravando `tipo_atribuicao = 'reuniao'`);
     - Permite **definir ou alterar o `prazo`** inline (`<input type="date">` que salva no banco);
     - Permite **alterar o escopo (`Geral` / `Frente`)** inline caso a casa decida direcionar a funça para uma frente na reunião;
     - Permite remover responsáveis caso quem tenha autoridade (Admin / Líder / Veterano) esteja ajustando a escala.

---

### PASSO 5: Integrar em `src/App.tsx` e `src/features/frentes/FrentesScreen.tsx`

1. **Em [`src/App.tsx`](./src/App.tsx):**
   - Remova a constante estática mockada `const funcas = [...]`.
   - Adicione estado `funcasReais` e carregue do Supabase (`public.funcas` + `public.funca_atribuicoes` + `public.profiles` + `public.fronts`), escutando também mudanças via Supabase Realtime (`postgres_changes` em `funcas` e `funca_atribuicoes`).
   - Adicione estado `frenteFiltroFuncas: string | null` para permitir abrir a tela de Funças já filtrada por uma frente específica.
   - Na **Home (`case 'home'`)**:
     - Na seção `"Suas funças pendentes"`, liste as funças reais não concluídas (`status !== 'concluida'`) em que o usuário logado está em `funca_atribuicoes` (ou onde `troca_solicitada_para === user.id`, exibindo tag `Pedido de Troca`).
     - Se não houver nenhuma, exiba `<Row title="Nenhuma funça pendente" meta="Aproveite o dia" onClick={() => go('funcas')} right={chevron} />`.
   - Na rota **`case 'funcas'`**:
     - Renderize `<FuncasScreen onBack={goBack} initialFrontId={frenteFiltroFuncas} onClearInitialFront={() => setFrenteFiltroFuncas(null)} />`.

2. **Em [`src/features/frentes/FrentesScreen.tsx`](./src/features/frentes/FrentesScreen.tsx):**
   - Adicione uma prop opcional `onOpenFuncasDaFrente?: (frontId: string) => void`.
   - Carregue as funças pendentes (`status !== 'concluida'`) da tabela `public.funcas` (com `funca_atribuicoes`).
   - Na lista das 10 frentes, mostre na `meta` ou nas tags quantas funças ativas aquela frente possui.
   - Dentro do **Modal de Detalhes da Frente (`frenteSelecionada`)**, adicione uma seção **"Funças desta Frente"**:
     - Lista as funças pendentes daquela frente com seus responsáveis (apelidos) e status;
     - Botão **"Ver / Abrir Funças desta Frente"** que fecha o modal e navega para `FuncasScreen` já filtrado naquela frente (`onOpenFuncasDaFrente(frenteSelecionada.id)`).

---

### PASSO 6: Criar Testes Unitários em `tests/unit/funcas-logic.test.mjs`

Crie o arquivo `.worktrees/funcas/tests/unit/funcas-logic.test.mjs` usando `node:test` e `node:assert/strict`, importando as funções puras de `../../src/types/funcas.ts`:

1. **Hierarquia de Gerações e Veterano $\rightarrow$ Bixo (`parseGeracaoNumero`, `isVeteranoDe`, `verificarPermissaoAtribuicao`):**
   - Veterano `'024'` pode atribuir Funça Geral para bixos `'025'` e `'026'` (`tipoAtribuicao === 'veterano_bixo'`).
   - Qualquer veterano ativo pode atribuir Funça Geral aberta por outro morador para um bixo seu.
   - Bixo `'026'` **não** pode atribuir Funça Geral para veterano `'024'` nem para colega da mesma geração `'026'`.
2. **Regras de Funça de Frente:**
   - Líder da frente pode atribuir para integrante da mesma frente (`tipoAtribuicao === 'lider_frente'`).
   - Líder da frente **não** pode atribuir Funça de Frente para quem não é membro daquela frente (no modo normal).
   - Integrante comum da frente pode se autoatribuir (`tipoAtribuicao === 'autoatribuicao'`), mas não pode atribuir para outro membro.
   - Morador fora da frente **não** pode se autoatribuir em Funça de Frente.
   - Admin pode atribuir tanto Funça Geral quanto Funça de Frente para qualquer morador (`tipoAtribuicao === 'admin_geral'`).
3. **Modo Reunião Semanal (`modoReuniao: true`):**
   - Qualquer morador ativo pode atribuir Funça Geral ou de Frente para qualquer morador ativo com `tipoAtribuicao === 'reuniao'`.
4. **Remoção de Responsável (`podeRemoverResponsavel`):**
   - Admin pode remover qualquer responsável.
   - Líder da frente pode remover responsável em funça da sua frente.
   - Veterano do morador atribuído pode removê-lo **tanto em Funça Geral quanto em Funça de Frente**.
   - O próprio morador atribuído (sem ser líder/admin) **não** pode se auto-remover diretamente (`false`).
5. **Solicitação de Troca (`podeSolicitarTroca`):**
   - O responsável atribuído pode solicitar troca para qualquer morador ativo da casa (inclusive de fora da frente em Funça de Frente, ou veterano).
   - Não pode solicitar troca para quem já é co-responsável na mesma funça nem para convidado externo/inativo.
6. **Transição Manual em 3 Etapas (`obterProximoStatusManual` & `podeAvancarStatusFunca`):**
   - Verifica sequência `'aberta'` $\rightarrow$ `'em_andamento'` $\rightarrow$ `'concluida'`.
   - Verifica quem tem permissão para avançar status e concluir.
7. **Exibição Estrita de Apelido (`obterApelidoMorador`):**
   - Prioriza sempre `apelido` sobre `nome`.

---

### PASSO 7: Atualizar Documentação (`AGY.md` e `REQUIREMENTS.md`) e Validar Build/Testes

1. Em [`.worktrees/funcas/AGY.md`](./AGY.md):
   - Na seção `3.4 Regras de Integridade e Derivações do MER-X` (item 5) e na `Fase 4`: marque como `[x] Sistema Geral de Funças` e documente o fluxo manual em 3 etapas (`aberta` $\rightarrow$ `em_andamento` $\rightarrow$ `concluida`), o suporte a múltiplos responsáveis, o mecanismo de solicitação de troca (`troca_solicitada_para` + RPC `aceitar_troca_funca`), a remoção restrita a Admin/Líder/Veterano e as políticas RLS de `funcas` e `funca_atribuicoes`.
2. Em [`.worktrees/funcas/REQUIREMENTS.md`](./REQUIREMENTS.md):
   - Na seção `3.5` e na `RN09`: detalhe as regras completas de atribuição, remoção por veterano/líder/admin, solicitação de troca com aceite, lançamento rápido em lote na Reunião Semanal e políticas RLS.
3. **Validação Final via Terminal (dentro de `.worktrees/funcas/`):**
   ```bash
   npm test
   npm run build
   ```
   Ambos os comandos devem passar com **zero erros**.
