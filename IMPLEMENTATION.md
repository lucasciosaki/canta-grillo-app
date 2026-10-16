# Plano de Implementação Detalhado — Páginas das Frentes Organizacionais & Chats Internos (`feature/frentes`)

> **Diretório Obrigatório de Trabalho:** `.worktrees/frentes/`  
> **Branch Alvo:** `feature/frentes`  
> **Alinhamento:** `GEMINI.md`, `AGY.md` (Fase 4) e `REQUIREMENTS.md` (RN02, RN08, RN09, RN10, RN11, RN14)

---

## 1. Escopo Consolidado e Decisões de Produto

1. **Controle de Acesso às Páginas das Frentes (Visibilidade por Participação):**
   - **Morador Comum (`role === 'morador'`):** Na tela `FrentesScreen.tsx`, vê **exclusivamente os cards das frentes em que participa** (`front_members.profile_id === user.id`). Não pode abrir páginas nem ler/enviar mensagens de frentes das quais não faz parte.
   - **Administrador (`role === 'admin'`):** Vê e acessa **todas as 10 frentes** para governança, alocação de membros, alternância de liderança (`is_lider`) e auditoria.
2. **Atalhos Rápidos para Toda a Casa (Fora das Páginas Restritas):**
   - Como moradores comuns só veem as frentes em que participam, a tela `FrentesScreen.tsx` (no topo, visível a qualquer morador ativo) disponibiliza **2 atalhos rápidos universais**:
     1. **"Alimentar Dogs (Manhã / Noite)":** Abre modal rápido para qualquer morador ativo registrar que deu a refeição da manhã ou da noite aos cães hoje (`public.dogs_refeicoes_diarias`).
     2. **"Pedir Item de Mercado":** Abre modal rápido para qualquer morador ativo solicitar itens faltantes a partir do Catálogo Mestre ativo (`public.market_catalog` $\rightarrow$ `public.solicitacoes_mercado`).
3. **Estrutura de Abas dentro da Página Dedicada de cada Frente:**
   - Ao clicar em uma frente da qual participa (ou qualquer frente se Admin), abre-se a visualização dedicada em tela cheia (substituindo o antigo modal simples) com navegação em abas:
     - **Aba 1 — `Painel` (Todas as 10 frentes):**
       - Lista todas as **Funças pendentes** (`status IN ('aberta', 'em_andamento')`) vinculadas àquela frente (`frente_id = frente.id`), exibindo título, descrição, prazo, status e responsáveis atribuídos (sempre pelo **apelido**).
       - Permite **Criar Nova Funça** vinculada à frente, **Autoatribuir-se** (`tipo_atribuicao = 'autoatribuicao'`), **Atribuir a um membro da frente** (exclusivo para Líder da frente `is_lider = true` ou `admin`, com `tipo_atribuicao = 'lider_frente'` ou `'admin_geral'`) e **Alterar Status / Concluir** (`aberta` $\rightarrow$ `em_andamento` $\rightarrow$ `concluida`).
     - **Aba Exclusiva por Slug (Apenas para Dogs, Mercado e Financeiro):**
       - Se `slug === 'dogs'`: Aba **`Refeições Dogs`** — Checklist diário dos 2 turnos (`manha` e `noite`) com apelido do morador, horário formatado (`HH:mm`), observação opcional e histórico recente. (Sem módulo de medicamentos/cuidados por ora).
       - Se `slug === 'mercado'`: Aba **`Mercado`** — Dividida em:
         1. **Checklist de Compras do Mês (`YYYY-MM`):** Lista solicitações dos moradores agrupadas por item/categoria com botão para marcar como `comprado` / `solicitado`.
         2. **Solicitar Item:** Seleção rápida a partir do catálogo ativo.
         3. **Catálogo Mestre (Exclusivo Membros da Frente Mercado / Admin):** Cadastrar novo produto (`nome`, `categoria`, `unidade_medida`), ativar/desativar item (`is_ativo`).
       - Se `slug === 'financeiro'`: Aba **`Externos (Mês)`** — Relatório mensal consolidado das refeições de convidados externos (`daily_meals` com `misturas_consumidas > 0` de perfis `role = 'externo'`), com filtro de ciclo mensal (`YYYY-MM`), total de refeições por convidado, datas consumidas e telefone de contato. (Sem controle de mensalidades fixas por ora).
     - **Aba — `Chat` (Todas as 10 frentes - RN11):**
       - Canal de mensagens em tempo real (`public.mensagens_frente` via `supabase_realtime`) restrito via RLS aos membros daquela frente e Admin.
       - Exibe estritamente o **apelido** do autor, badge de Líder (`⭐`) se aplicável, horário de envio e campo de envio rápido.
     - **Aba — `Membros` (Todas as 10 frentes - RN14):**
       - Lista Líderes (`is_lider = true`) e Integrantes da frente (exibindo estritamente **apelido**, geração e quarto).
       - Controles administrativos (vincular morador, promover/remover liderança, remover da frente) visíveis exclusivamente para `isAdmin`.
4. **Identificação Estrita por Apelido:**
   - Em todos os componentes, chats, funças, checklists do Dogs, solicitações de mercado e listas de membros, utilizar função utilitária padronizada `obterApelido(perfil)` que retorna `perfil?.apelido?.trim() || perfil?.nome || 'Morador'`.

---

## 2. Arquitetura de Arquivos no Worktree (`.worktrees/frentes/`)

| Arquivo | Ação | Responsabilidade |
| :--- | :--- | :--- |
| `supabase/schema.sql` | **Modificar** | Adicionar funções helper RLS (`is_front_member`, `is_front_lider`, `is_front_member_by_slug`), políticas RLS para `fronts`, `mensagens_frente`, `funcas`, `funca_atribuicoes`, `dogs_refeicoes_diarias`, `market_catalog`, `solicitacoes_mercado`, seed inicial de `market_catalog` e publicação `supabase_realtime`. |
| `src/types/frentes.ts` | **Modificar** | Definir todas as interfaces TypeScript (`MensagemFrente`, `FuncaFrente`, `FuncaAtribuicao`, `DogsRefeicaoDiaria`, `MarketCatalogItem`, `SolicitacaoMercado`, `ResumoExternoMes`) e funções puras de negócio e validação para testes unitários. |
| `src/features/frentes/FrentesScreen.tsx` | **Modificar** | Listagem filtrada por participação (ou todas para Admin), atalhos rápidos no topo ("Alimentar Dogs" e "Pedir Item de Mercado"), e container da página dedicada da frente com abas (`Painel`, aba específica de `dogs`/`mercado`/`financeiro`, `Chat`, `Membros`). |
| `src/features/frentes/components/FrentePainelTab.tsx` | **Criar** | Aba "Painel da Frente" com listagem das Funças pendentes da frente, criação de funça na frente, autoatribuição, atribuição por Líder/Admin e transição de status. |
| `src/features/frentes/components/FrenteChatTab.tsx` | **Criar** | Aba "Chat da Frente" conectada à tabela `public.mensagens_frente` com assinatura Realtime (`postgres_changes`), scroll automático e exibição por apelido. |
| `src/features/frentes/components/FrenteDogsTab.tsx` | **Criar** | Aba exclusiva da Frente Dogs (`slug === 'dogs'`) + componente reutilizável de Checklist das 2 refeições diárias (Manhã e Noite). |
| `src/features/frentes/components/FrenteMercadoTab.tsx` | **Criar** | Aba exclusiva da Frente Mercado (`slug === 'mercado'`) com Checklist de Compras do mês, Solicitação de Itens e gestão do Catálogo Mestre. |
| `src/features/frentes/components/FrenteFinanceiroTab.tsx` | **Criar** | Aba exclusiva da Frente Financeiro (`slug === 'financeiro'`) com consolidação mensal de refeições de convidados externos (`daily_meals` + `role = 'externo'`). |
| `tests/unit/frentes-logic.test.mjs` | **Criar** | Testes unitários cobrindo filtro de frentes por morador, regras de permissão de funças da frente, checklist Dogs, agrupamento de mercado e cálculo mensal de convidados externos. |
| `tests/security/frentes-rls-security.test.mjs` | **Criar** | Testes de segurança validando isolamento RLS de `mensagens_frente`, `market_catalog`, `solicitacoes_mercado`, `dogs_refeicoes_diarias` e `funcas`. |
| `AGY.md` & `REQUIREMENTS.md` | **Modificar** | Atualizar documentação com as políticas de RLS das Frentes, Chats, Mercado, Dogs e Funças conforme diretriz obrigatória do `GEMINI.md`. |

---

## 3. Segurança Database-First e Políticas RLS (`supabase/schema.sql`)

Adicionar ao final de `.worktrees/frentes/supabase/schema.sql` a seção **8. POLÍTICAS RLS E REALTIME: FRENTES, CHATS, FUNÇAS, DOGS E MERCADO**:

```sql
-- ==============================================================================
-- 8. POLÍTICAS RLS E REALTIME: FRENTES, CHATS, FUNÇAS, DOGS E MERCADO (FASE 4)
-- ==============================================================================

-- 8.1 Funções Helper de Permissão em Frentes (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_front_member(p_front_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.front_members fm
    JOIN public.profiles p ON p.id = fm.profile_id
    WHERE fm.front_id = p_front_id
      AND fm.profile_id = auth.uid()
      AND p.ativo = true
      AND p.role IN ('morador', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_front_lider(p_front_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.front_members fm
    JOIN public.profiles p ON p.id = fm.profile_id
    WHERE fm.front_id = p_front_id
      AND fm.profile_id = auth.uid()
      AND fm.is_lider = true
      AND p.ativo = true
      AND p.role IN ('morador', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_front_member_by_slug(p_slug TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.front_members fm
    JOIN public.fronts f ON f.id = fm.front_id
    JOIN public.profiles p ON p.id = fm.profile_id
    WHERE f.slug = p_slug
      AND fm.profile_id = auth.uid()
      AND p.ativo = true
      AND p.role IN ('morador', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 8.2 TABELA FRONTS
ALTER TABLE public.fronts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moradores ativos e admin leem frentes" ON public.fronts;
CREATE POLICY "Moradores ativos e admin leem frentes"
ON public.fronts FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Apenas admin gerencia frentes" ON public.fronts;
CREATE POLICY "Apenas admin gerencia frentes"
ON public.fronts FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8.3 TABELA MENSAGENS_FRENTE (Isolamento Estrito por Membro da Frente ou Admin - RN11)
ALTER TABLE public.mensagens_frente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros da frente e admin leem mensagens da frente" ON public.mensagens_frente;
CREATE POLICY "Membros da frente e admin leem mensagens da frente"
ON public.mensagens_frente FOR SELECT
TO authenticated
USING (
  public.is_admin() OR public.is_front_member(frente_id)
);

DROP POLICY IF EXISTS "Membros da frente e admin enviam mensagens na frente" ON public.mensagens_frente;
CREATE POLICY "Membros da frente e admin enviam mensagens na frente"
ON public.mensagens_frente FOR INSERT
TO authenticated
WITH CHECK (
  autor_id = auth.uid() AND (
    public.is_admin() OR public.is_front_member(frente_id)
  )
);

DROP POLICY IF EXISTS "Autor ou admin remove mensagem da frente" ON public.mensagens_frente;
CREATE POLICY "Autor ou admin remove mensagem da frente"
ON public.mensagens_frente FOR DELETE
TO authenticated
USING (
  public.is_admin() OR (public.is_front_member(frente_id) AND autor_id = auth.uid())
);

-- 8.4 TABELAS FUNCAS E FUNCA_ATRIBUICOES (RN09)
ALTER TABLE public.funcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funca_atribuicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moradores ativos e admin leem funcas" ON public.funcas;
CREATE POLICY "Moradores ativos e admin leem funcas"
ON public.funcas FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Morador ativo ou admin cria funca" ON public.funcas;
CREATE POLICY "Morador ativo ou admin cria funca"
ON public.funcas FOR INSERT
TO authenticated
WITH CHECK (
  relator_id = auth.uid() AND (public.is_admin() OR public.is_active_morador())
);

DROP POLICY IF EXISTS "Membros da frente relator ou admin atualizam funca" ON public.funcas;
CREATE POLICY "Membros da frente relator ou admin atualizam funca"
ON public.funcas FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (frente_id IS NOT NULL AND public.is_front_member(frente_id))
  OR relator_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.funca_atribuicoes fa
    WHERE fa.funca_id = public.funcas.id AND fa.morador_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR (frente_id IS NOT NULL AND public.is_front_member(frente_id))
  OR relator_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.funca_atribuicoes fa
    WHERE fa.funca_id = public.funcas.id AND fa.morador_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admin lider da frente ou relator remove funca" ON public.funcas;
CREATE POLICY "Admin lider da frente ou relator remove funca"
ON public.funcas FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (frente_id IS NOT NULL AND public.is_front_lider(frente_id))
  OR relator_id = auth.uid()
);

-- FUNCA_ATRIBUICOES
DROP POLICY IF EXISTS "Moradores ativos e admin leem atribuicoes de funcas" ON public.funca_atribuicoes;
CREATE POLICY "Moradores ativos e admin leem atribuicoes de funcas"
ON public.funca_atribuicoes FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Atribuicao de funcas validada por cargo" ON public.funca_atribuicoes;
CREATE POLICY "Atribuicao de funcas validada por cargo"
ON public.funca_atribuicoes FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    -- Autoatribuição: morador ativo atribui para si mesmo
    public.is_active_morador()
    AND morador_id = auth.uid()
    AND atribuido_por = auth.uid()
    AND tipo_atribuicao = 'autoatribuicao'
    AND EXISTS (
      SELECT 1 FROM public.funcas f
      WHERE f.id = funca_id
        AND (f.frente_id IS NULL OR public.is_front_member(f.frente_id))
    )
  )
  OR (
    -- Líder de Frente: atribui funça da sua frente para membro da mesma frente
    public.is_active_morador()
    AND atribuido_por = auth.uid()
    AND tipo_atribuicao = 'lider_frente'
    AND EXISTS (
      SELECT 1 FROM public.funcas f
      JOIN public.front_members fm ON fm.front_id = f.frente_id AND fm.profile_id = public.funca_atribuicoes.morador_id
      WHERE f.id = funca_id
        AND f.frente_id IS NOT NULL
        AND public.is_front_lider(f.frente_id)
    )
  )
);

DROP POLICY IF EXISTS "Remover atribuicao de funca" ON public.funca_atribuicoes;
CREATE POLICY "Remover atribuicao de funca"
ON public.funca_atribuicoes FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR morador_id = auth.uid()
  OR atribuido_por = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.funcas f
    WHERE f.id = funca_id AND f.frente_id IS NOT NULL AND public.is_front_lider(f.frente_id)
  )
);

-- 8.5 TABELA DOGS_REFEICOES_DIARIAS (RN10 - Checklist Diário Manhã e Noite)
ALTER TABLE public.dogs_refeicoes_diarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moradores ativos e admin leem refeicoes dos dogs" ON public.dogs_refeicoes_diarias;
CREATE POLICY "Moradores ativos e admin leem refeicoes dos dogs"
ON public.dogs_refeicoes_diarias FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Morador ativo ou admin registra refeicao dos dogs hoje" ON public.dogs_refeicoes_diarias;
CREATE POLICY "Morador ativo ou admin registra refeicao dos dogs hoje"
ON public.dogs_refeicoes_diarias FOR INSERT
TO authenticated
WITH CHECK (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE
  AND alimentado_por = auth.uid()
  AND (public.is_admin() OR public.is_active_morador())
);

DROP POLICY IF EXISTS "Morador ativo ou admin atualiza refeicao dos dogs hoje" ON public.dogs_refeicoes_diarias;
CREATE POLICY "Morador ativo ou admin atualiza refeicao dos dogs hoje"
ON public.dogs_refeicoes_diarias FOR UPDATE
TO authenticated
USING (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE
  AND (public.is_admin() OR public.is_active_morador())
)
WITH CHECK (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE
  AND alimentado_por = auth.uid()
  AND (public.is_admin() OR public.is_active_morador())
);

DROP POLICY IF EXISTS "Autor membro dogs ou admin desmarca refeicao dos dogs hoje" ON public.dogs_refeicoes_diarias;
CREATE POLICY "Autor membro dogs ou admin desmarca refeicao dos dogs hoje"
ON public.dogs_refeicoes_diarias FOR DELETE
TO authenticated
USING (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE
  AND (
    public.is_admin()
    OR public.is_front_member_by_slug('dogs')
    OR (public.is_active_morador() AND alimentado_por = auth.uid())
  )
);

-- 8.6 TABELAS MARKET_CATALOG E SOLICITACOES_MERCADO (RN08)
ALTER TABLE public.market_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_mercado ENABLE ROW LEVEL SECURITY;

-- Catálogo Mestre: Todos os moradores ativos leem; apenas Frente Mercado ou Admin gerenciam
DROP POLICY IF EXISTS "Moradores ativos e admin leem catalogo de mercado" ON public.market_catalog;
CREATE POLICY "Moradores ativos e admin leem catalogo de mercado"
ON public.market_catalog FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Apenas frente mercado ou admin gerencia catalogo" ON public.market_catalog;
CREATE POLICY "Apenas frente mercado ou admin gerencia catalogo"
ON public.market_catalog FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_front_member_by_slug('mercado'))
WITH CHECK (public.is_admin() OR public.is_front_member_by_slug('mercado'));

-- Solicitações de Mercado: Moradores ativos solicitam; Frente Mercado ou Admin dão baixa ('comprado')
DROP POLICY IF EXISTS "Moradores ativos e admin leem solicitacoes de mercado" ON public.solicitacoes_mercado;
CREATE POLICY "Moradores ativos e admin leem solicitacoes de mercado"
ON public.solicitacoes_mercado FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Morador ativo solicita item do catalogo" ON public.solicitacoes_mercado;
CREATE POLICY "Morador ativo solicita item do catalogo"
ON public.solicitacoes_mercado FOR INSERT
TO authenticated
WITH CHECK (
  solicitado_por = auth.uid()
  AND status = 'solicitado'
  AND (public.is_admin() OR public.is_active_morador())
);

DROP POLICY IF EXISTS "Frente mercado ou admin atualiza status de compra" ON public.solicitacoes_mercado;
CREATE POLICY "Frente mercado ou admin atualiza status de compra"
ON public.solicitacoes_mercado FOR UPDATE
TO authenticated
USING (public.is_admin() OR public.is_front_member_by_slug('mercado'))
WITH CHECK (public.is_admin() OR public.is_front_member_by_slug('mercado'));

DROP POLICY IF EXISTS "Autor frente mercado ou admin remove solicitacao" ON public.solicitacoes_mercado;
CREATE POLICY "Autor frente mercado ou admin remove solicitacao"
ON public.solicitacoes_mercado FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR public.is_front_member_by_slug('mercado')
  OR (public.is_active_morador() AND solicitado_por = auth.uid() AND status = 'solicitado')
);

-- Seed Inicial do Catálogo Mestre de Mercado
INSERT INTO public.market_catalog (nome, categoria, unidade_medida, is_ativo)
VALUES
  ('Arroz Tipo 1 (5kg)', 'Alimentos', 'pacote', true),
  ('Feijão Carioca (1kg)', 'Alimentos', 'pacote', true),
  ('Óleo de Soja', 'Alimentos', 'garrafa', true),
  ('Café em Pó (500g)', 'Alimentos', 'pacote', true),
  ('Açúcar Refinado (1kg)', 'Alimentos', 'pacote', true),
  ('Sal Refinado (1kg)', 'Alimentos', 'pacote', true),
  ('Detergente Neutro', 'Limpeza', 'frasco', true),
  ('Sabão em Pó', 'Limpeza', 'caixa', true),
  ('Água Sanitária (2L)', 'Limpeza', 'garrafa', true),
  ('Desinfetante', 'Limpeza', 'garrafa', true),
  ('Esponja de Louça', 'Limpeza', 'pacote', true),
  ('Saco de Lixo 100L', 'Descartáveis', 'rolo', true),
  ('Papel Higiênico (Fardo)', 'Higiene', 'fardo', true)
ON CONFLICT (nome) DO NOTHING;

-- 8.7 Publicação Realtime para as tabelas da Fase 4
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mensagens_frente',
    'funcas',
    'funca_atribuicoes',
    'dogs_refeicoes_diarias',
    'market_catalog',
    'solicitacoes_mercado'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
```

---

## 4. Tipagens e Funções Puras de Negócio (`src/types/frentes.ts`)

O arquivo `src/types/frentes.ts` deve exportar todas as estruturas e funções puras (que serão testadas em `tests/unit/frentes-logic.test.mjs`):

### 4.1 Tipos e Interfaces
- `Front`, `FrontMember`, `FrontWithMembers` (mantidos e expandidos).
- `FrenteDetalheTab = 'painel' | 'especifica' | 'chat' | 'membros'`.
- `MensagemFrente`:
  - `id: string`, `frente_id: string`, `autor_id: string`, `conteudo: string`, `enviada_em: string`, `autor?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null`.
- `StatusFunca = 'aberta' | 'em_andamento' | 'concluida'`.
- `TipoAtribuicaoFunca = 'autoatribuicao' | 'lider_frente' | 'veterano_bixo' | 'admin_geral' | 'reuniao'`.
- `FuncaAtribuicao`:
  - `funca_id: string`, `morador_id: string`, `atribuido_por: string | null`, `tipo_atribuicao: TipoAtribuicaoFunca`, `atribuido_em: string`, `morador?: Pick<Profile, 'id' | 'nome' | 'apelido' | 'geracao'> | null`.
- `FuncaFrente`:
  - `id: string`, `frente_id: string | null`, `relator_id: string`, `titulo: string`, `descricao: string`, `foto_url: string | null`, `status: StatusFunca`, `prazo: string | null`, `created_at: string`, `relator?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null`, `atribuicoes?: FuncaAtribuicao[]`.
- `TurnoDogs = 'manha' | 'noite'`.
- `DogsRefeicaoDiaria`:
  - `id: string`, `data: string`, `turno: TurnoDogs`, `alimentado_por: string`, `horario_alimentacao: string`, `observacoes: string | null`, `morador?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null`.
- `CategoriaMercado = 'Alimentos' | 'Limpeza' | 'Higiene' | 'Descartáveis' | 'Outros'`.
- `MarketCatalogItem`:
  - `id: string`, `nome: string`, `categoria: string`, `unidade_medida: string`, `is_ativo: boolean`, `created_at?: string`.
- `SolicitacaoMercado`:
  - `item_id: string`, `mes_ano_ciclo: string`, `solicitado_por: string`, `status: 'solicitado' | 'comprado'`, `data_solicitacao: string`, `item?: MarketCatalogItem`, `solicitante?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null`.
- `ItemCompraAgrupado`:
  - `item: MarketCatalogItem`, `solicitantesApelidos: string[]`, `todosComprados: boolean`, `solicitacoes: SolicitacaoMercado[]`.
- `ResumoConvidadoFinanceiro`:
  - `convidado_id: string`, `apelido: string`, `telefone_contato: string | null`, `total_refeicoes: number`, `datas_consumo: string[]`.

### 4.2 Funções Puras Obrigatórias em `src/types/frentes.ts`
1. `obterApelidoFrente(perfil?: { nome?: string | null; apelido?: string | null } | null): string`
   - Prioriza estritamente `perfil.apelido.trim()`, fazendo fallback para `perfil.nome.trim()` apenas se apelido for nulo/vazio, ou `'Morador'`.
2. `filtrarFrentesVisiveis(frentes: Front[], membros: FrontMember[], userId?: string | null, isAdmin?: boolean): Front[]`
   - Se `isAdmin === true`, retorna todas as `frentes`.
   - Caso contrário, retorna **apenas** as frentes em que existe `m` em `membros` com `m.front_id === f.id && m.profile_id === userId`.
3. `verificarPermissaoFrente(frenteId: string, membros: FrontMember[], userId?: string | null, isAdmin?: boolean): { podeAcessar: boolean; isMembro: boolean; isLider: boolean }`
   - Calcula se o usuário pode abrir a frente (`isAdmin || isMembro`), se é membro e se é líder (`is_lider === true`).
4. `filtrarFuncasPendentesDaFrente(funcas: FuncaFrente[], frenteId: string): FuncaFrente[]`
   - Filtra `f.frente_id === frenteId && (f.status === 'aberta' || f.status === 'em_andamento')`, ordenando `'em_andamento'` e prazos mais próximos no topo.
5. `podeAtribuirFuncaNaFrente(params: { isAdmin: boolean; isLiderDaFrente: boolean; isMembroDaFrente: boolean; autorId: string; alvoMoradorId: string }): { permitido: boolean; tipoAtribuicao: TipoAtribuicaoFunca | null }`
   - Se `autorId === alvoMoradorId` e `(isMembroDaFrente || isAdmin)` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'autoatribuicao' }`.
   - Se `isLiderDaFrente` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'lider_frente' }`.
   - Se `isAdmin` $\rightarrow$ `{ permitido: true, tipoAtribuicao: 'admin_geral' }`.
   - Caso contrário $\rightarrow$ `{ permitido: false, tipoAtribuicao: null }`.
6. `obterStatusChecklistDogsDia(registrosDia: DogsRefeicaoDiaria[]): { manha: DogsRefeicaoDiaria | null; noite: DogsRefeicaoDiaria | null; completo: boolean }`
   - Retorna os registros dos turnos `'manha'` e `'noite'` e se ambos foram cumpridos no dia.
7. `agruparSolicitacoesMercadoPorItem(solicitacoes: SolicitacaoMercado[], catalogo: MarketCatalogItem[]): ItemCompraAgrupado[]`
   - Agrupa múltiplas solicitações do mesmo `item_id` no ciclo mensal em um único card de compra para o checklist do supermercado, listando os apelidos de quem pediu e se todas as solicitações daquele item já estão com `status === 'comprado'`.
8. `calcularRelatorioExternosMes(perfisExternos: Pick<Profile, 'id' | 'nome' | 'apelido' | 'telefone_contato' | 'role'>[], refeicoes: { usuario_id: string; data: string; misturas_consumidas: number }[], mesAnoCiclo: string): ResumoConvidadoFinanceiro[]`
   - Filtra refeições cujo prefixo `data.startsWith(mesAnoCiclo)` (ex: `'2026-10'`) e `Number(misturas_consumidas) > 0`, agregando para cada convidado (`role === 'externo'`) a quantidade de refeições no mês e as datas ordenadas, ordenando os convidados com maior consumo no topo.
9. `obterMesAnoAtual(date?: Date): string`
   - Retorna `'YYYY-MM'` no fuso local.

---

## 5. Detalhamento Sequencial das 4 Etapas de Front-End

### Etapa 1 — Fundação + Acesso por Participação + Painel de Funças + Chat das 10 Frentes
1. **Listagem e Controle de Acesso em `FrentesScreen.tsx`:**
   - Usar `filtrarFrentesVisiveis(frentes, membros, user?.id, isAdmin)`.
   - Se o morador comum não estiver alocado em nenhuma frente ainda, exibir aviso amigável: *"Você ainda não foi vinculado a nenhuma frente organizacional. Peça ao Admin da república para incluí-lo na sua frente."*
   - No topo de `FrentesScreen.tsx`, antes da seção de frentes, exibir a barra de **Ações Rápidas da Casa** com 2 botões `outline`:
     - `🐕 Alimentar Dogs` (abre modal de checklist do dia Manhã/Noite).
     - `🛒 Pedir Item de Mercado` (abre modal de solicitação a partir do catálogo mestre).
2. **Navegação Dedicada da Frente Selecionada:**
   - Ao selecionar uma frente (`frenteSelecionada !== null`), renderizar a página interna da frente (usando `PageTitle` com `back={{ label: 'Frentes', onClick: () => setFrenteSelecionada(null) }}`) em vez de um modal pequeno, aproveitando 100% da altura mobile.
   - Barra de Abas (`painel`, `especifica` quando `slug` for `'dogs' | 'mercado' | 'financeiro'`, `chat`, `membros`).
3. **Componente `FrentePainelTab.tsx` (Funças Pendentes da Frente):**
   - Carrega de `public.funcas` (onde `frente_id = frente.id`) e `public.funca_atribuicoes` (com join de `profiles(id, nome, apelido, geracao)`), assinado no Realtime.
   - Exibe todas as **Funças Pendentes** (`aberta` e `em_andamento`) no topo e uma seção recolhível para concluídas recentes.
   - Botão **"+ Nova Funça na Frente"**: abre formulário rápido (título, descrição, prazo opcional) inserindo em `public.funcas` com `frente_id = frente.id` e `relator_id = user.id`.
   - Em cada card de Funça Pendente:
     - Exibe tags de status (`Aberta` em terracota/neutra, `Em andamento` em verde), apelido de quem abriu, prazo e apelidos dos responsáveis atribuídos.
     - Botão **"Puxar p/ mim"** (autoatribuição em 1 toque se o morador logado ainda não estiver atribuído).
     - Se `isLider` ou `isAdmin`: seletor compacto **"Atribuir membro..."** listando os apelidos dos integrantes da frente.
     - Botões de transição rápida de status: **"Iniciar"** (`em_andamento`) e **"Concluir ✓"** (`concluida`).
4. **Componente `FrenteChatTab.tsx` (Chat Interno da Frente - RN11):**
   - Carrega mensagens de `public.mensagens_frente` filtrando `frente_id = frente.id` ordenadas por `enviada_em ASC`.
   - Assina `supabase.channel('chat-frente-' + frente.id)` escutando `INSERT` e `DELETE` em `public.mensagens_frente` com `filter: 'frente_id=eq.' + frente.id`.
   - Renderiza balões estilo editorial (`bg-forest text-white` para mensagens próprias à direita; `bg-surface border border-line text-ink` para mensagens de colegas à esquerda), mostrando estritamente o **apelido** do autor, badge `⭐ Líder` se o autor for líder da frente, e hora (`HH:mm`).
   - Formulário inferior fixo com input de texto e botão de envio com atualização otimista.

---

### Etapa 2 — Frente Dogs (`slug === 'dogs'` + Atalho Rápido - RN10)
1. **Componente `FrenteDogsTab.tsx`:**
   - Exibe a data de hoje formatada por extenso (`Hoje, ...`) e os 2 cards de turno diário:
     - **Turno da Manhã (`turno = 'manha'`)**
     - **Turno da Noite (`turno = 'noite'`)**
   - Para cada turno:
     - Se **já alimentado hoje**: exibe badge verde `Alimentado ✓`, o **apelido** do morador que alimentou, o horário exato (`HH:mm`), eventual observação e botão discreto "Desmarcar" (se foi o próprio autor, membro da frente Dogs ou Admin).
     - Se **pendente hoje**: exibe tag de alerta `Pendente`, campo opcional de observação rápida (ex: *"Ração + água fresca trocada"*) e botão primário **"Marcar que alimentei agora"**, fazendo `upsert` em `public.dogs_refeicoes_diarias` com `data = getLocalDateString()`, `turno`, `alimentado_por = user.id`, `horario_alimentacao = new Date().toISOString()`.
   - Abaixo dos 2 cards do dia, exibe o **Histórico dos Últimos 7 Dias** (somente leitura) mostrando quem alimentou nos turnos anteriores (sempre por apelido).
2. **Modal Rápido "Alimentar Dogs" em `FrentesScreen.tsx`:**
   - Reutiliza `FrenteDogsTab` (em modo compacto dentro de um modal) para que qualquer morador da casa (mesmo que não seja membro da Frente Dogs) possa registrar rapidamente que deu comida aos cães pela manhã ou à noite.

---

### Etapa 3 — Frente Mercado (`slug === 'mercado'` + Atalho Rápido - RN08)
1. **Componente `FrenteMercadoTab.tsx`:**
   - Possui 2 sub-visões internas para os membros da Frente Mercado (e Admin):
     - **Sub-aba 1: `Lista de Compras & Pedidos` (Ciclo Mensal `YYYY-MM`):**
       - Seletor do ciclo mensal (padrão: mês atual `obterMesAnoAtual()`).
       - Botão **"+ Solicitar Item Faltante"** (permite escolher qualquer item ativo do `market_catalog`).
       - Lista agrupada (`agruparSolicitacoesMercadoPorItem`) separando **Itens Pendentes de Compra** no topo e **Itens Já Comprados** abaixo.
       - Cada linha mostra: nome do produto, categoria, unidade, **apelidos** dos moradores que solicitaram (ex: *"Pedido por: Ganso, Cachorrão"*) e checkbox/botão **"Marcar Comprado"** (que atualiza `status = 'comprado'` em `public.solicitacoes_mercado` para aquele `item_id` e `mes_ano_ciclo`).
     - **Sub-aba 2: `Catálogo Mestre` (Exclusiva para Membros da Frente Mercado e Admin):**
       - Formulário para adicionar novo item ao catálogo oficial (`nome`, `categoria` entre `Alimentos`, `Limpeza`, `Higiene`, `Descartáveis`, `Outros`, e `unidade_medida`).
       - Lista de todos os itens do `market_catalog` filtrável por categoria, permitindo ativar/desativar (`is_ativo`) ou remover itens obsoletos.
2. **Modal Rápido "Pedir Item de Mercado" em `FrentesScreen.tsx`:**
   - Acessível a todos os moradores ativos da república.
   - Exibe busca/filtro por categoria dos itens ativos do `market_catalog`, indicando quais itens já foram solicitados no mês atual e permitindo solicitar com 1 toque (`INSERT` em `public.solicitacoes_mercado`).

---

### Etapa 4 — Frente Financeiro / Caixinha (`slug === 'financeiro'` - RN02)
1. **Componente `FrenteFinanceiroTab.tsx`:**
   - Seletor de mês de referência (`YYYY-MM`, padrão: mês atual `obterMesAnoAtual()`, com botões de mês anterior/próximo).
   - Consulta todos os perfis com `role = 'externo'` e os registros de `public.daily_meals` no intervalo do mês selecionado (`data >= YYYY-MM-01` e `data <= YYYY-MM-31` com `misturas_consumidas > 0`).
   - Processa os dados com `calcularRelatorioExternosMes`.
   - Exibe:
     - **Cards de Resumo do Mês:** Total de refeições de externos no mês e total de convidados distintos que comeram na casa.
     - **Lista Consolidada por Convidado Externo:**
       - Nome de exibição estritamente pelo **apelido** do convidado + telefone de contato (se cadastrado).
       - Badge de destaque com o **Total de Refeições no Mês** (ex: `4 refeições`).
       - Lista expansível ou chips com os dias exatos em que o convidado almoçou/jantou na casa naquele mês (ex: `04/10`, `11/10`, `15/10`).
       - Atalho opcional para abrir conversa no WhatsApp caso `telefone_contato` esteja preenchido.

---

## 6. Especificação de Testes Automatizados

### 6.1 Testes Unitários (`tests/unit/frentes-logic.test.mjs`)
Deve rodar via `npm test` (`node --test tests/unit/**/*.test.mjs`) e validar:
1. **`obterApelidoFrente`:** Prioriza `apelido`, faz fallback para `nome` quando `apelido` for nulo/vazio e retorna `'Morador'` quando indefinido.
2. **`filtrarFrentesVisiveis`:**
   - Morador comum recebe estritamente as frentes em que está presente em `front_members`.
   - Morador sem frentes recebe array vazio `[]`.
   - Administrador (`isAdmin = true`) recebe todas as 10 frentes.
3. **`verificarPermissaoFrente`:** Retorna corretamente `podeAcessar`, `isMembro` e `isLider` para morador membro, morador líder, morador não-membro e admin.
4. **`filtrarFuncasPendentesDaFrente` & `podeAtribuirFuncaNaFrente`:**
   - Filtra apenas funças da frente com status `'aberta'` ou `'em_andamento'`.
   - Membro comum pode apenas se autoatribuir (`autoatribuicao`), sendo bloqueado ao tentar atribuir para outro colega.
   - Líder da frente pode atribuir para qualquer membro da frente (`lider_frente`).
   - Admin pode atribuir para qualquer membro (`admin_geral`).
5. **`obterStatusChecklistDogsDia`:** Identifica corretamente quando apenas manhã, apenas noite ou ambos os turnos foram cumpridos no dia.
6. **`agruparSolicitacoesMercadoPorItem`:** Agrupa pedidos de múltiplos moradores para o mesmo item no mês, consolida a lista de apelidos dos solicitantes e calcula `todosComprados`.
7. **`calcularRelatorioExternosMes`:** Soma apenas refeições do mês selecionado (`YYYY-MM`) com `misturas_consumidas > 0` pertencentes a usuários `role === 'externo'`, ordenando do maior para o menor consumo.

### 6.2 Testes de Segurança RLS (`tests/security/frentes-rls-security.test.mjs`)
Deve rodar via `npm run test:security` e validar contra o Supabase:
1. Usuário anônimo (`anonClient`) não consegue ler nem inserir em `mensagens_frente`, `funcas`, `dogs_refeicoes_diarias`, `market_catalog` ou `solicitacoes_mercado`.
2. Morador não-membro de uma frente tem `SELECT` (0 linhas) e `INSERT` bloqueados pelo RLS em `public.mensagens_frente` daquela frente.
3. Morador comum que não pertence à Frente Mercado é bloqueado pelo RLS ao tentar inserir ou editar produtos em `public.market_catalog` ou marcar `status = 'comprado'` em `public.solicitacoes_mercado`.

---

## 7. Checklist de Verificação Final para o Modelo Implementador

- [ ] Executar todas as leituras, criações/edições e comandos exclusivamente dentro de `.worktrees/frentes/`.
- [ ] Atualizar `.worktrees/frentes/supabase/schema.sql` com as funções e políticas RLS da Seção 3.
- [ ] Implementar `src/types/frentes.ts` e os componentes das 4 etapas em `src/features/frentes/`.
- [ ] Atualizar `.worktrees/frentes/AGY.md` e `.worktrees/frentes/REQUIREMENTS.md` documentando as políticas de RLS de Frentes, Chats, Funças, Dogs e Mercado.
- [ ] Rodar `npm test` e `npm run build` dentro de `.worktrees/frentes/` garantindo 0 erros de compilação TypeScript (`tsc -b`) e 100% dos testes unitários passando.
