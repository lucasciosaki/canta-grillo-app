-- ==============================================================================
-- Schema SQL Oficial - República Canta Grillo (Supabase / PostgreSQL)
-- Alinhado com a Especificação MER-X do AGY.md e REQUIREMENTS.md
-- ==============================================================================

-- Habilitar extensão para geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE QUARTOS
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT UNIQUE NOT NULL,
    capacidade INT NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA DE PERFIS DE USUÁRIOS (Especialização Total e Disjunta t, d)
-- role: 'admin' (Conta institucional/superadmin), 'morador' ou 'externo'
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    apelido TEXT,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'morador', 'externo')),
    ativo BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Atributos específicos da subclasse MORADOR
    geracao TEXT CHECK (role != 'morador' OR geracao IS NOT NULL),
    quarto_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    
    -- Atributos específicos da subclasse MEMBRO_EXTERNO
    telefone_contato TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE FRENTES ORGANIZACIONAIS
CREATE TABLE IF NOT EXISTS public.fronts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    descricao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ASSOCIAÇÃO MORADOR <-> FRENTE (Suporta Co-liderança de Frentes)
CREATE TABLE IF NOT EXISTS public.front_members (
    front_id UUID NOT NULL REFERENCES public.fronts(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_lider BOOLEAN NOT NULL DEFAULT FALSE,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (front_id, profile_id)
);

-- 5. FOLHA DE MISTURAS DIÁRIAS (Refeições - Almoço e Janta)
-- cota de misturas: 0.0 (vazio), 0.5 (1/2 mistura), 1.0 (X / 2 misturas)
CREATE TABLE IF NOT EXISTS public.daily_meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    misturas_consumidas NUMERIC(2,1) NOT NULL DEFAULT 0.0 CHECK (misturas_consumidas IN (0.0, 0.5, 1.0)),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_usuario_data UNIQUE (usuario_id, data)
);

-- 6. ÁREAS COMUNS DA CASA
CREATE TABLE IF NOT EXISTS public.areas_comuns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT UNIQUE NOT NULL,
    descricao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ESCALA SEMANAL DE FAXINA (Chave Primária Composta Natural)
CREATE TABLE IF NOT EXISTS public.escala_semanal_faxina (
    quarto_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    area_comum_id UUID NOT NULL REFERENCES public.areas_comuns(id) ON DELETE CASCADE,
    semana_ano INT NOT NULL CHECK (semana_ano BETWEEN 1 AND 53),
    ano INT NOT NULL CHECK (ano >= 2024),
    penalidade_atribuida TEXT,
    pontos_faltas INT NOT NULL DEFAULT 0,
    PRIMARY KEY (quarto_id, area_comum_id, semana_ano, ano)
);

-- 8. REGISTROS DIÁRIOS DE FAXINA (Comprovação por Fotos e Fiscalização do Halls)
CREATE TABLE IF NOT EXISTS public.registro_diario_faxina (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quarto_id UUID NOT NULL,
    area_comum_id UUID NOT NULL,
    semana_ano INT NOT NULL,
    ano INT NOT NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'cumprido' CHECK (status IN ('cumprido', 'faltou')),
    fotos_comprovacao TEXT[] NOT NULL DEFAULT '{}',
    registrado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    enviado_em TIMESTAMPTZ DEFAULT NOW(),
    
    -- Avaliação do Fiscal (Halls)
    fiscal_status TEXT NOT NULL DEFAULT 'pendente' CHECK (fiscal_status IN ('pendente', 'aprovado', 'reprovado', 'omitido')),
    fiscal_foto_url TEXT,
    fiscal_observacao TEXT,
    fiscalizado_em TIMESTAMPTZ,
    fiscalizado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    FOREIGN KEY (quarto_id, area_comum_id, semana_ano, ano) 
        REFERENCES public.escala_semanal_faxina(quarto_id, area_comum_id, semana_ano, ano) ON DELETE CASCADE,
    CONSTRAINT unique_escala_dia UNIQUE (quarto_id, area_comum_id, semana_ano, ano, data)
);

-- 8.1 REGRAS DE PENALIDADES DO QUADRO DE PONTOS (Configuração Progressiva de 2 a 7 Pontos)
CREATE TABLE IF NOT EXISTS public.regras_quadro_pontos (
    pontos INT PRIMARY KEY CHECK (pontos BETWEEN 2 AND 7),
    descricao TEXT NOT NULL,
    atualizado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Seed de Regras Padrão de 2 a 7 Pontos
INSERT INTO public.regras_quadro_pontos (pontos, descricao)
VALUES
    (2, 'Pagar 1 caixa de cerveja para a casa'),
    (3, 'Pagar 2 caixas de cerveja para a casa'),
    (4, 'Lavar a cozinha no domingo + 2 caixas'),
    (5, 'Faxina geral da área externa + 3 caixas'),
    (6, 'Faxina pesada da república inteira'),
    (7, 'Pena máxima: Churrasco por conta do quarto')
ON CONFLICT (pontos) DO NOTHING;

-- 9. PONTOS DE BAGUNÇA (Pontos Individuais com Foto e Chat)
CREATE TABLE IF NOT EXISTS public.pontos_bagunca (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    relator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    culpado_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    foto_url TEXT NOT NULL,
    local_descricao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'assumida')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    assumida_em TIMESTAMPTZ
);

-- 9.1 VISUALIZAÇÕES DO PONTO DE BAGUNÇA (Controle de Blur e Regra de 24h)
CREATE TABLE IF NOT EXISTS public.pontos_bagunca_visualizacoes (
    ponto_id UUID NOT NULL REFERENCES public.pontos_bagunca(id) ON DELETE CASCADE,
    morador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    visualizado_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ponto_id, morador_id)
);

-- 10. MENSAGENS DE DISCUSSÃO DO PONTO DE BAGUNÇA (Thread Interna)
CREATE TABLE IF NOT EXISTS public.mensagens_ponto_bagunca (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ponto_bagunca_id UUID NOT NULL REFERENCES public.pontos_bagunca(id) ON DELETE CASCADE,
    autor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conteudo TEXT NOT NULL,
    enviada_em TIMESTAMPTZ DEFAULT NOW()
);

-- 11. GESTÃO DE CAIXAS DE CERVEJA (Registro Estritamente Unitário)
CREATE TABLE IF NOT EXISTS public.caixas_cerveja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    morador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    motivo_descricao TEXT NOT NULL,
    origem TEXT NOT NULL CHECK (origem IN ('pontos', 'manual')),
    data_atribuicao DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'baixa_solicitada', 'paga')),
    solicitada_em TIMESTAMPTZ,
    baixada_em TIMESTAMPTZ,
    baixada_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. SISTEMA GERAL DE FUNÇAS (Tarefas e Demandas)
CREATE TABLE IF NOT EXISTS public.funcas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    frente_id UUID REFERENCES public.fronts(id) ON DELETE SET NULL, -- NULL indica Funça Geral
    relator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    foto_url TEXT,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'concluida')),
    prazo DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- 14. CHAT INTERNO DAS FRENTES
CREATE TABLE IF NOT EXISTS public.mensagens_frente (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    frente_id UUID NOT NULL REFERENCES public.fronts(id) ON DELETE CASCADE,
    autor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conteudo TEXT NOT NULL,
    enviada_em TIMESTAMPTZ DEFAULT NOW()
);

-- 15. REFEIÇÕES DOS CACHORROS (Frente Dogs)
CREATE TABLE IF NOT EXISTS public.dogs_refeicoes_diarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    turno TEXT NOT NULL CHECK (turno IN ('manha', 'noite')),
    alimentado_por UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    horario_alimentacao TIMESTAMPTZ DEFAULT NOW(),
    observacoes TEXT,
    CONSTRAINT unique_dogs_data_turno UNIQUE (data, turno)
);

-- 16. CATÁLOGO MESTRE DO MERCADO
CREATE TABLE IF NOT EXISTS public.market_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT UNIQUE NOT NULL,
    categoria TEXT NOT NULL,
    unidade_medida TEXT NOT NULL DEFAULT 'unidade',
    is_ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. SOLICITAÇÃO MENSAL DE ITENS DE MERCADO (Chave Natural Composta)
CREATE TABLE IF NOT EXISTS public.solicitacoes_mercado (
    item_id UUID NOT NULL REFERENCES public.market_catalog(id) ON DELETE CASCADE,
    mes_ano_ciclo TEXT NOT NULL, -- Ex: '2026-10'
    solicitado_por UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'comprado')),
    data_solicitacao TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (item_id, mes_ano_ciclo, solicitado_por)
);

-- 18. ATAS DE REUNIÃO (link para documento externo; a "última ata" é a de maior data_reuniao)
CREATE TABLE IF NOT EXISTS public.atas_reuniao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_reuniao DATE NOT NULL,
    url TEXT NOT NULL CHECK (url ~* '^https?://'),
    titulo TEXT,
    publicada_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atas_reuniao_data ON public.atas_reuniao (data_reuniao DESC);

-- 19. CONFIGURAÇÕES E LINKS DA CASA (Drive da República, etc.)
CREATE TABLE IF NOT EXISTS public.house_settings (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    descricao TEXT,
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TRIGGER AUTOMÁTICO: 7 PONTOS DE DESORGANIZAÇÃO NO MÊS = 1 CAIXA DE CERVEJA
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_pontos_gerar_cerveja()
RETURNS TRIGGER AS $$
DECLARE
    v_total_pontos INT;
    v_data_ref TIMESTAMPTZ := COALESCE(NEW.assumida_em, NOW());
    v_mes_inicio DATE := DATE_TRUNC('month', v_data_ref)::DATE;
    v_mes_fim DATE := (DATE_TRUNC('month', v_data_ref) + INTERVAL '1 month - 1 day')::DATE;
BEGIN
    -- Atua apenas quando o registro entra no status 'assumida' com um culpado definido
    IF (
        NEW.status = 'assumida'
        AND NEW.culpado_id IS NOT NULL
        AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'assumida')
    ) THEN
        SELECT COUNT(*)
        INTO v_total_pontos
        FROM public.pontos_bagunca
        WHERE culpado_id = NEW.culpado_id
          AND status = 'assumida'
          AND COALESCE(assumida_em, created_at)::DATE BETWEEN v_mes_inicio AND v_mes_fim;

        -- A cada múltiplo exato de 7 pontos no mês civil, gera 1 caixa unitária
        IF (v_total_pontos > 0 AND v_total_pontos % 7 = 0) THEN
            INSERT INTO public.caixas_cerveja (
                morador_id,
                motivo_descricao,
                origem,
                data_atribuicao,
                status
            ) VALUES (
                NEW.culpado_id,
                'Acúmulo de ' || v_total_pontos || ' pontos de bagunça em ' || TO_CHAR(v_data_ref, 'MM/YYYY'),
                'pontos',
                CURRENT_DATE,
                'pendente'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_gerar_cerveja_por_pontos ON public.pontos_bagunca;
CREATE TRIGGER trg_gerar_cerveja_por_pontos
AFTER INSERT OR UPDATE OF status ON public.pontos_bagunca
FOR EACH ROW
EXECUTE FUNCTION public.check_pontos_gerar_cerveja();

-- ==============================================================================
-- POPULAÇÃO INICIAL DAS 10 FRENTES DA CANTA GRILLO
-- ==============================================================================
INSERT INTO public.fronts (nome, slug, descricao)
VALUES 
    ('Financeiro (Caixinha)', 'financeiro', 'Gestão do fluxo de caixa e mensalidade da república'),
    ('Manutenção', 'manutencao', 'Reparos prediais e conservação estrutural da casa'),
    ('Piscina', 'piscina', 'Tratamento químico, aspiração e manutenção da piscina'),
    ('Jardim', 'jardim', 'Cuidados com a área verde, poda e rega'),
    ('Mercado', 'mercado', 'Catálogo mestre e compras mensais de alimentos e limpeza'),
    ('Dogs', 'dogs', 'Cuidados, remédios e controle das 2 refeições diárias dos cães'),
    ('PP (Marketing)', 'pp', 'Redes sociais, divulgação de eventos e comunicação visual'),
    ('Valéria', 'valeria', 'Ponto oficial de contato com a proprietária do imóvel'),
    ('Hanna', 'hanna', 'Ponto oficial de contato e boa vizinhança'),
    ('Varanda', 'varanda', 'Organização e conservação da área social da varanda')
ON CONFLICT (slug) DO NOTHING;

-- ==============================================================================
-- POPULAÇÃO DOS QUARTOS DA REPÚBLICA (Nomes Oficiais Canta Grillo)
-- ==============================================================================
INSERT INTO public.rooms (nome, capacidade)
VALUES 
    ('Carandiru', 4),
    ('High School', 3),
    ('Principal', 3),
    ('Quádruplo', 4),
    ('Triplo', 3),
    ('Varanda', 3)
ON CONFLICT (nome) DO NOTHING;

-- ==============================================================================
-- POPULAÇÃO DAS 6 ÁREAS / FUNÇÕES DE FAXINA DA REPÚBLICA
-- ==============================================================================
INSERT INTO public.areas_comuns (nome, descricao)
VALUES 
    ('Sala de TV', 'Organização diária e recolhimento de itens na Sala de TV'),
    ('Sala de Estudos', 'Limpeza de mesas, cadeiras e organização do espaço de estudos'),
    ('Externo', 'Limpeza e recolhimento de materiais na área externa'),
    ('Dispensa', 'Organização das prateleiras e mantimentos na dispensa'),
    ('Cozinha', 'Organização de pias, bancadas e recolhimento de louças'),
    ('Halls', 'Limpeza dos corredores e fiscalização diária das outras 5 funções da casa')
ON CONFLICT (nome) DO NOTHING;

-- ==============================================================================
-- TRIGGER AUTOMÁTICO: NOVO USUÁRIO AUTH -> CRIA PERFIL EM PROFILES
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_quarto_id UUID := NULL;
  v_raw_quarto TEXT;
  v_role TEXT;
  v_ativo BOOLEAN;
  v_telefone TEXT;
BEGIN
  -- Sanitização rigorosa de cargo:
  -- Apenas 'externo' é aceito diretamente via metadata de cadastro rápido.
  -- Se tentar 'admin' ou qualquer valor arbitrário, força 'morador'.
  IF new.raw_user_meta_data->>'role' = 'externo' THEN
    v_role := 'externo';
    v_ativo := TRUE; -- Convidados externos têm aprovação imediata para poder marcar refeição no mesmo dia
  ELSE
    v_role := 'morador';
    v_ativo := FALSE; -- Novos moradores da república exigem aprovação prévia do Admin
  END IF;

  v_telefone := new.raw_user_meta_data->>'telefone_contato';
  v_raw_quarto := NULLIF(new.raw_user_meta_data->>'quarto_id', '');

  -- Valida se o quarto existe de fato na tabela rooms para evitar quebra de FK (apenas para morador)
  IF v_role = 'morador' AND v_raw_quarto IS NOT NULL THEN
    BEGIN
      SELECT id INTO v_quarto_id 
      FROM public.rooms 
      WHERE id = v_raw_quarto::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_quarto_id := NULL;
    END;
  END IF;

  -- Se já existir perfil órfão com o mesmo e-mail (ex: usuário deletado em auth.users), remove para evitar erro de UK
  DELETE FROM public.profiles WHERE email = new.email AND id <> new.id;

  INSERT INTO public.profiles (
    id,
    email,
    nome,
    apelido,
    role,
    geracao,
    quarto_id,
    telefone_contato,
    ativo
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'apelido',
    v_role,
    CASE WHEN v_role = 'morador' THEN COALESCE(new.raw_user_meta_data->>'geracao', '025') ELSE NULL END,
    CASE WHEN v_role = 'morador' THEN v_quarto_id ELSE NULL END,
    v_telefone,
    v_ativo
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    apelido = EXCLUDED.apelido,
    telefone_contato = EXCLUDED.telefone_contato,
    geracao = EXCLUDED.geracao,
    quarto_id = EXCLUDED.quarto_id;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- SEGURANÇA E POLÍTICAS RLS (Row Level Security)
-- ==============================================================================

-- Função helper para checar se o usuário atual é Administrador ativo
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. TABELA ROOMS (Leitura pública para o formulário de cadastro)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura de quartos" ON public.rooms;
DROP POLICY IF EXISTS "Quartos visiveis para todos" ON public.rooms;
CREATE POLICY "Quartos visiveis para todos"
ON public.rooms FOR SELECT
TO anon, authenticated
USING (true);

-- 2. TABELA PROFILES (Blindada: sem INSERT manual de clientes)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Leitura: Qualquer usuário autenticado pode ver os moradores da casa
DROP POLICY IF EXISTS "Leitura de perfis para autenticados" ON public.profiles;
CREATE POLICY "Leitura de perfis para autenticados"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Atualização: Admin pode atualizar qualquer campo; morador só atualiza seus próprios dados cadastrais
DROP POLICY IF EXISTS "Admin pode atualizar qualquer perfil" ON public.profiles;
DROP POLICY IF EXISTS "Atualizacao de perfis" ON public.profiles;
CREATE POLICY "Atualizacao de perfis"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_admin() OR auth.uid() = id)
WITH CHECK (public.is_admin() OR (auth.uid() = id AND role IN ('morador', 'externo')));

-- Exclusão: Apenas Admin pode recusar/deletar perfis
DROP POLICY IF EXISTS "Apenas admin pode deletar perfis" ON public.profiles;
CREATE POLICY "Apenas admin pode deletar perfis"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- Inserção: Fechada para chamadas externas. Criação de perfis ocorre exclusivamente via trigger handle_new_user().
DROP POLICY IF EXISTS "Permitir insercao de perfil no cadastro" ON public.profiles;
DROP POLICY IF EXISTS "Cadastro de perfil seguro" ON public.profiles;

-- TRIGGER DE PROTEÇÃO DE COLUNAS CRÍTICAS (ativo e role)
-- Permite edição direta pelo painel do Supabase (SQL Editor / Table Editor, onde auth.uid() é NULL)
-- ou via service_role, bloqueando apenas usuários comuns autenticados via cliente (PostgREST).
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(), '') != 'service_role' AND NOT public.is_admin() THEN
    -- Morador comum não pode alterar o próprio 'ativo' (auto-aprovação)
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      RAISE EXCEPTION 'Apenas administradores podem aprovar ou alterar o status ativo de um morador.';
    END IF;
    -- Morador comum não pode alterar o próprio 'role' (auto-promoção para admin)
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o cargo (role) de um usuário.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_roles ON public.profiles;
CREATE TRIGGER trg_protect_profile_roles
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_roles();

-- ==============================================================================
-- 3. TABELA FRONT_MEMBERS (Frentes Organizacionais)
-- ==============================================================================
ALTER TABLE public.front_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler membros das frentes" ON public.front_members;
CREATE POLICY "Todos podem ler membros das frentes"
ON public.front_members FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Apenas admin insere membros na frente" ON public.front_members;
CREATE POLICY "Apenas admin insere membros na frente"
ON public.front_members FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = front_members.profile_id
      AND p.role IN ('morador', 'admin')
      AND p.ativo = true
  )
);

DROP POLICY IF EXISTS "Apenas admin altera lideranca" ON public.front_members;
CREATE POLICY "Apenas admin altera lideranca"
ON public.front_members FOR UPDATE
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Apenas admin remove membros da frente" ON public.front_members;
CREATE POLICY "Apenas admin remove membros da frente"
ON public.front_members FOR DELETE
TO authenticated
USING (public.is_admin());

-- ==============================================================================
-- 4. TABELA DAILY_MEALS (Folha de Misturas Digital - RN01)
-- ==============================================================================
ALTER TABLE public.daily_meals ENABLE ROW LEVEL SECURITY;

-- Helper para verificar se o usuário atual é morador ativo da república
CREATE OR REPLACE FUNCTION public.is_active_morador()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('morador', 'admin') AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper para verificar se o usuário atual é convidado externo ativo
CREATE OR REPLACE FUNCTION public.is_active_externo()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'externo' AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- SELECT: Moradores ativos e Admin podem ver todas as refeições; Convidado externo pode ver suas próprias refeições
DROP POLICY IF EXISTS "Todos podem ler refeicoes" ON public.daily_meals;
DROP POLICY IF EXISTS "Leitura de refeicoes" ON public.daily_meals;
CREATE POLICY "Leitura de refeicoes"
ON public.daily_meals FOR SELECT
TO authenticated
USING (
  public.is_admin() OR 
  public.is_active_morador() OR 
  (public.is_active_externo() AND usuario_id = auth.uid())
);

-- INSERT: Morador ativo ou convidado externo podem marcar sua própria refeição hoje; Admin pode marcar para qualquer um hoje
DROP POLICY IF EXISTS "Morador ativo ou admin insere refeicao" ON public.daily_meals;
DROP POLICY IF EXISTS "Insercao de refeicao diaria" ON public.daily_meals;
CREATE POLICY "Insercao de refeicao diaria"
ON public.daily_meals FOR INSERT
TO authenticated
WITH CHECK (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE AND (
    public.is_admin() OR (
      (public.is_active_morador() OR public.is_active_externo()) AND usuario_id = auth.uid()
    )
  )
);

-- UPDATE: Alterações permitidas exclusivamente no dia de hoje (dias anteriores são somente leitura)
DROP POLICY IF EXISTS "Morador ativo ou admin atualiza refeicao" ON public.daily_meals;
DROP POLICY IF EXISTS "Atualizacao de refeicao diaria" ON public.daily_meals;
CREATE POLICY "Atualizacao de refeicao diaria"
ON public.daily_meals FOR UPDATE
TO authenticated
USING (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE AND (
    public.is_admin() OR (
      (public.is_active_morador() OR public.is_active_externo()) AND usuario_id = auth.uid()
    )
  )
)
WITH CHECK (
  data = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE AND (
    public.is_admin() OR (
      (public.is_active_morador() OR public.is_active_externo()) AND usuario_id = auth.uid()
    )
  )
);

-- DELETE: Remoção permitida para morador ativo, convidado externo (própria refeição) ou Administrador
DROP POLICY IF EXISTS "Morador ativo ou admin remove refeicao" ON public.daily_meals;
DROP POLICY IF EXISTS "Remocao de refeicao diaria" ON public.daily_meals;
CREATE POLICY "Remocao de refeicao diaria"
ON public.daily_meals FOR DELETE
TO authenticated
USING (
  public.is_admin() OR (
    (public.is_active_morador() OR public.is_active_externo()) AND usuario_id = auth.uid()
  )
);

-- Habilita Realtime na tabela daily_meals para sincronização instantânea
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_meals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_meals;
  END IF;
END $$;

-- ==============================================================================
-- 5. TABELA PONTOS_BAGUNCA & MENSAGENS_PONTO_BAGUNCA (Segurança RLS)
-- ==============================================================================
ALTER TABLE public.pontos_bagunca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_ponto_bagunca ENABLE ROW LEVEL SECURITY;

-- SELECT: Todos os moradores autenticados podem visualizar os pontos de bagunça
DROP POLICY IF EXISTS "Todos podem ler pontos de bagunca" ON public.pontos_bagunca;
CREATE POLICY "Todos podem ler pontos de bagunca"
ON public.pontos_bagunca FOR SELECT
TO authenticated
USING (true);

-- INSERT: Qualquer morador ativo pode abrir um ponto de bagunça (relator_id deve ser o próprio usuário)
DROP POLICY IF EXISTS "Morador ativo pode relatar ponto de bagunca" ON public.pontos_bagunca;
CREATE POLICY "Morador ativo pode relatar ponto de bagunca"
ON public.pontos_bagunca FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND relator_id = auth.uid()
  )
);

-- UPDATE: Culpado pode assumir o ponto (passa status para 'assumida', define culpado_id = auth.uid()), ou Admin
DROP POLICY IF EXISTS "Culpado assume ou admin atualiza ponto de bagunca" ON public.pontos_bagunca;
CREATE POLICY "Culpado assume ou admin atualiza ponto de bagunca"
ON public.pontos_bagunca FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR public.is_active_morador()
)
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND (
      (status = 'assumida' AND culpado_id = auth.uid()) OR
      (relator_id = auth.uid())
    )
  )
);

-- DELETE: Apenas admin pode excluir registros de pontos de bagunça
DROP POLICY IF EXISTS "Apenas admin deleta ponto de bagunca" ON public.pontos_bagunca;
CREATE POLICY "Apenas admin deleta ponto de bagunca"
ON public.pontos_bagunca FOR DELETE
TO authenticated
USING (public.is_admin());

-- MENSAGENS DO PONTO DE BAGUNÇA
DROP POLICY IF EXISTS "Todos podem ler mensagens do ponto de bagunca" ON public.mensagens_ponto_bagunca;
CREATE POLICY "Todos podem ler mensagens do ponto de bagunca"
ON public.mensagens_ponto_bagunca FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Morador ativo envia mensagem no ponto de bagunca" ON public.mensagens_ponto_bagunca;
CREATE POLICY "Morador ativo envia mensagem no ponto de bagunca"
ON public.mensagens_ponto_bagunca FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND autor_id = auth.uid()
  )
);

-- VISUALIZAÇÕES DO PONTO DE BAGUNÇA (Controle de Blur e 24h)
ALTER TABLE public.pontos_bagunca_visualizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler visualizacoes de pontos" ON public.pontos_bagunca_visualizacoes;
CREATE POLICY "Todos podem ler visualizacoes de pontos"
ON public.pontos_bagunca_visualizacoes FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Morador ativo registra sua visualizacao" ON public.pontos_bagunca_visualizacoes;
CREATE POLICY "Morador ativo registra sua visualizacao"
ON public.pontos_bagunca_visualizacoes FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador() AND morador_id = auth.uid()
  )
);

-- ==============================================================================
-- FUNÇÃO: VERIFICAÇÃO AUTOMÁTICA DE 24 HORAS E APLICAÇÃO DE PENALIDADES
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.verificar_penalidades_pontos_24h()
RETURNS INT AS $$
DECLARE
    v_penalizados INT := 0;
    r_ponto RECORD;
    r_morador RECORD;
BEGIN
    FOR r_ponto IN
        SELECT id, local_descricao, created_at
        FROM public.pontos_bagunca
        WHERE status = 'aberta'
          AND created_at <= NOW() - INTERVAL '24 hours'
    LOOP
        -- Identifica moradores ativos da casa que não visualizaram o ponto após 24h
        FOR r_morador IN
            SELECT p.id
            FROM public.profiles p
            WHERE p.ativo = TRUE 
              AND p.role IN ('morador', 'admin')
              AND p.id NOT IN (
                  SELECT morador_id FROM public.pontos_bagunca_visualizacoes WHERE ponto_id = r_ponto.id
              )
              -- Evita duplicidade de penalidade pelo mesmo ponto expirado
              AND NOT EXISTS (
                  SELECT 1 FROM public.pontos_bagunca pb_sub
                  WHERE pb_sub.culpado_id = p.id
                    AND pb_sub.local_descricao = 'Penalidade: Não visualizou ponto em 24h (' || r_ponto.id::text || ')'
              )
        LOOP
            INSERT INTO public.pontos_bagunca (
                relator_id,
                culpado_id,
                foto_url,
                local_descricao,
                status,
                assumida_em
            ) VALUES (
                r_morador.id,
                r_morador.id,
                '', -- Ponto gerado administrativamente pelo sistema
                'Penalidade: Não visualizou ponto em 24h (' || r_ponto.id::text || ')',
                'assumida',
                NOW()
            );
            v_penalizados := v_penalizados + 1;
        END LOOP;
    END LOOP;
    RETURN v_penalizados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilita Realtime para pontos_bagunca, mensagens_ponto_bagunca e visualizacoes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pontos_bagunca'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pontos_bagunca;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'mensagens_ponto_bagunca'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_ponto_bagunca;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pontos_bagunca_visualizacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pontos_bagunca_visualizacoes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'escala_semanal_faxina'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.escala_semanal_faxina;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'registro_diario_faxina'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.registro_diario_faxina;
  END IF;
END $$;

-- ==============================================================================
-- 6. POLÍTICAS RLS: ÁREAS COMUNS, ESCALA SEMANAL E REGISTRO DIÁRIO DE FAXINA
-- ==============================================================================
ALTER TABLE public.areas_comuns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_semanal_faxina ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_diario_faxina ENABLE ROW LEVEL SECURITY;

-- AREAS COMUNS: Leitura livre (anon e authenticated, idêntico à tabela rooms)
DROP POLICY IF EXISTS "Leitura de areas comuns" ON public.areas_comuns;
CREATE POLICY "Leitura de areas comuns"
ON public.areas_comuns FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admin ou morador gerencia areas comuns" ON public.areas_comuns;
CREATE POLICY "Admin ou morador gerencia areas comuns"
ON public.areas_comuns FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_active_morador())
WITH CHECK (public.is_admin() OR public.is_active_morador());

-- ESCALA SEMANAL: Leitura livre (anon e authenticated)
DROP POLICY IF EXISTS "Todos podem ler escala semanal" ON public.escala_semanal_faxina;
CREATE POLICY "Todos podem ler escala semanal"
ON public.escala_semanal_faxina FOR SELECT
TO anon, authenticated
USING (true);

-- ESCALA SEMANAL: Escrita permitida para Admin ou processos de backend
DROP POLICY IF EXISTS "Admin ou backend gerencia escala semanal" ON public.escala_semanal_faxina;
CREATE POLICY "Admin ou backend gerencia escala semanal"
ON public.escala_semanal_faxina FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_active_morador())
WITH CHECK (public.is_admin() OR public.is_active_morador());

-- REGISTRO DIÁRIO: Leitura livre (anon e authenticated)
DROP POLICY IF EXISTS "Todos podem ler registros diarios de faxina" ON public.registro_diario_faxina;
CREATE POLICY "Todos podem ler registros diarios de faxina"
ON public.registro_diario_faxina FOR SELECT
TO anon, authenticated
USING (true);

-- REGISTRO DIÁRIO: Morador ativo pode inserir ou atualizar foto e check
DROP POLICY IF EXISTS "Moradores ativos e admin registram faxina diaria" ON public.registro_diario_faxina;
CREATE POLICY "Moradores ativos e admin registram faxina diaria"
ON public.registro_diario_faxina FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_active_morador())
WITH CHECK (public.is_admin() OR public.is_active_morador());

-- REGRAS DO QUADRO DE PONTOS (2 a 7 Pontos): RLS e Realtime
ALTER TABLE public.regras_quadro_pontos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler regras do quadro de pontos" ON public.regras_quadro_pontos;
CREATE POLICY "Todos podem ler regras do quadro de pontos"
ON public.regras_quadro_pontos FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admin ou morador gerencia regras de pontos" ON public.regras_quadro_pontos;
CREATE POLICY "Admin ou morador gerencia regras de pontos"
ON public.regras_quadro_pontos FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_active_morador())
WITH CHECK (public.is_admin() OR public.is_active_morador());

-- Habilita Realtime na tabela regras_quadro_pontos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'regras_quadro_pontos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.regras_quadro_pontos;
  END IF;
END $$;

-- ==============================================================================
-- 7. POLÍTICAS RLS E TRIGGERS: GESTÃO DE CAIXAS DE CERVEJA (RN07)
-- ==============================================================================

-- 7.1 Habilitar Row Level Security em public.caixas_cerveja
ALTER TABLE public.caixas_cerveja ENABLE ROW LEVEL SECURITY;

-- SELECT: Moradores ativos e Administradores leem todo o mural e histórico
DROP POLICY IF EXISTS "Moradores ativos e admin leem caixas de cerveja" ON public.caixas_cerveja;
CREATE POLICY "Moradores ativos e admin leem caixas de cerveja"
ON public.caixas_cerveja FOR SELECT
TO authenticated
USING (
  public.is_admin() OR public.is_active_morador()
);

-- INSERT: Exclusivo para Administradores em lançamentos manuais
DROP POLICY IF EXISTS "Apenas admin lanca caixa de cerveja manual" ON public.caixas_cerveja;
CREATE POLICY "Apenas admin lanca caixa de cerveja manual"
ON public.caixas_cerveja FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() AND origem = 'manual'
);

-- UPDATE: Admin gerencia qualquer status; Morador ativo solicita baixa da própria caixa
DROP POLICY IF EXISTS "Admin liquida ou morador solicita baixa de cerveja" ON public.caixas_cerveja;
CREATE POLICY "Admin liquida ou morador solicita baixa de cerveja"
ON public.caixas_cerveja FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR (public.is_active_morador() AND morador_id = auth.uid())
)
WITH CHECK (
  public.is_admin() OR (
    public.is_active_morador()
    AND morador_id = auth.uid()
    AND status = 'baixa_solicitada'
  )
);

-- DELETE: Exclusivo para Administradores
DROP POLICY IF EXISTS "Apenas admin remove caixa de cerveja" ON public.caixas_cerveja;
CREATE POLICY "Apenas admin remove caixa de cerveja"
ON public.caixas_cerveja FOR DELETE
TO authenticated
USING (
  public.is_admin()
);

-- 7.2 Trigger de Proteção de Colunas e Transição de Status
CREATE OR REPLACE FUNCTION public.protect_caixas_cerveja_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF OLD.status <> 'pendente' OR NEW.status <> 'baixa_solicitada' THEN
      RAISE EXCEPTION 'Moradores só podem solicitar baixa de caixas com status pendente.';
    END IF;

    IF NEW.morador_id IS DISTINCT FROM OLD.morador_id
       OR NEW.motivo_descricao IS DISTINCT FROM OLD.motivo_descricao
       OR NEW.origem IS DISTINCT FROM OLD.origem
       OR NEW.data_atribuicao IS DISTINCT FROM OLD.data_atribuicao
       OR NEW.baixada_em IS DISTINCT FROM OLD.baixada_em
       OR NEW.baixada_por IS DISTINCT FROM OLD.baixada_por
    THEN
      RAISE EXCEPTION 'Não é permitido alterar dados cadastrais ou de auditoria da caixa de cerveja.';
    END IF;

    NEW.solicitada_em := COALESCE(NEW.solicitada_em, NOW());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_caixas_cerveja_update ON public.caixas_cerveja;
CREATE TRIGGER trg_protect_caixas_cerveja_update
BEFORE UPDATE ON public.caixas_cerveja
FOR EACH ROW
EXECUTE FUNCTION public.protect_caixas_cerveja_update();

-- ==============================================================================
-- 8. SISTEMA GERAL DE FUNÇAS E REUNIÃO SEMANAL: HELPERS, RPC DE TROCA E RLS
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

-- Habilita Realtime para caixas_cerveja, funcas e funca_atribuicoes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'caixas_cerveja'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caixas_cerveja;
  END IF;

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

-- ==============================================================================
-- 9. POLÍTICAS RLS: ATAS DE REUNIÃO E CONFIGURAÇÕES DA CASA (RN12)
-- ==============================================================================
ALTER TABLE public.atas_reuniao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_settings ENABLE ROW LEVEL SECURITY;

-- 9.1 ATAS DE REUNIÃO: Qualquer morador ativo ou Admin pode ler, publicar, editar e excluir
DROP POLICY IF EXISTS "Moradores ativos e admin leem atas" ON public.atas_reuniao;
CREATE POLICY "Moradores ativos e admin leem atas"
ON public.atas_reuniao FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Moradores ativos e admin publicam atas" ON public.atas_reuniao;
CREATE POLICY "Moradores ativos e admin publicam atas"
ON public.atas_reuniao FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Moradores ativos e admin editam atas" ON public.atas_reuniao;
CREATE POLICY "Moradores ativos e admin editam atas"
ON public.atas_reuniao FOR UPDATE
TO authenticated
USING (public.is_admin() OR public.is_active_morador())
WITH CHECK (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Moradores ativos e admin excluem atas" ON public.atas_reuniao;
CREATE POLICY "Moradores ativos e admin excluem atas"
ON public.atas_reuniao FOR DELETE
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

-- 9.2 HOUSE SETTINGS (Link do Drive): Moradores ativos leem; apenas Admin altera
DROP POLICY IF EXISTS "Moradores ativos e admin leem house_settings" ON public.house_settings;
CREATE POLICY "Moradores ativos e admin leem house_settings"
ON public.house_settings FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_active_morador());

DROP POLICY IF EXISTS "Apenas admin gerencia house_settings" ON public.house_settings;
CREATE POLICY "Apenas admin gerencia house_settings"
ON public.house_settings FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Habilitar Realtime para atas_reuniao e house_settings
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['atas_reuniao', 'house_settings']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
