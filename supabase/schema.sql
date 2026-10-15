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
    PRIMARY KEY (quarto_id, area_comum_id, semana_ano, ano)
);

-- 8. REGISTROS DIÁRIOS DE FAXINA (Comprovação por Fotos)
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
    FOREIGN KEY (quarto_id, area_comum_id, semana_ano, ano) 
        REFERENCES public.escala_semanal_faxina(quarto_id, area_comum_id, semana_ano, ano) ON DELETE CASCADE,
    CONSTRAINT unique_escala_dia UNIQUE (quarto_id, area_comum_id, semana_ano, ano, data)
);

-- 9. OCORRÊNCIAS DE DESORGANIZAÇÃO (Pontos Individuais com Foto e Chat)
CREATE TABLE IF NOT EXISTS public.ocorrencias_desorganizacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    relator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    culpado_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    foto_url TEXT NOT NULL,
    local_descricao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'assumida')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    assumida_em TIMESTAMPTZ
);

-- 10. MENSAGENS DE DISCUSSÃO DA OCORRÊNCIA (Thread Interna)
CREATE TABLE IF NOT EXISTS public.mensagens_ocorrencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ocorrencia_id UUID NOT NULL REFERENCES public.ocorrencias_desorganizacao(id) ON DELETE CASCADE,
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

-- 13. ATRIBUIÇÃO DE FUNÇAS
CREATE TABLE IF NOT EXISTS public.funca_atribuicoes (
    funca_id UUID NOT NULL REFERENCES public.funcas(id) ON DELETE CASCADE,
    morador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    atribuido_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    tipo_atribuicao TEXT NOT NULL CHECK (tipo_atribuicao IN ('autoatribuicao', 'lider_frente', 'veterano_bixo', 'admin_geral', 'reuniao')),
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (funca_id, morador_id)
);

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
    v_mes_inicio DATE := DATE_TRUNC('month', NEW.assumida_em);
    v_mes_fim DATE := (DATE_TRUNC('month', NEW.assumida_em) + INTERVAL '1 month - 1 day')::DATE;
BEGIN
    -- Apenas atua quando uma ocorrência for assumida por um culpado
    IF (NEW.status = 'assumida' AND NEW.culpado_id IS NOT NULL) THEN
        SELECT COUNT(*)
        INTO v_total_pontos
        FROM public.ocorrencias_desorganizacao
        WHERE culpado_id = NEW.culpado_id
          AND status = 'assumida'
          AND assumida_em::DATE BETWEEN v_mes_inicio AND v_mes_fim;

        -- Se atingir exatamente 7 pontos (ou múltiplos), insere a pendência da caixa de cerveja
        IF (v_total_pontos % 7 = 0) THEN
            INSERT INTO public.caixas_cerveja (
                morador_id,
                motivo_descricao,
                origem,
                data_atribuicao,
                status
            ) VALUES (
                NEW.culpado_id,
                'Acúmulo de 7 pontos individuais de desorganização em ' || TO_CHAR(NEW.assumida_em, 'MM/YYYY'),
                'pontos',
                CURRENT_DATE,
                'pendente'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_gerar_cerveja_por_pontos ON public.ocorrencias_desorganizacao;
CREATE TRIGGER trg_gerar_cerveja_por_pontos
AFTER UPDATE OF status ON public.ocorrencias_desorganizacao
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
-- TRIGGER AUTOMÁTICO: NOVO USUÁRIO AUTH -> CRIA PERFIL EM PROFILES
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_quarto_id UUID := NULL;
  v_raw_quarto TEXT;
BEGIN
  v_raw_quarto := NULLIF(new.raw_user_meta_data->>'quarto_id', '');

  -- Valida se o quarto existe de fato na tabela rooms para evitar quebra de chave estrangeira
  IF v_raw_quarto IS NOT NULL THEN
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

  INSERT INTO public.profiles (id, email, nome, apelido, role, geracao, quarto_id, ativo)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'apelido',
    'morador', -- SEMPRE morador comum (impossível auto-promoção)
    COALESCE(new.raw_user_meta_data->>'geracao', '025'),
    v_quarto_id,
    FALSE      -- SEMPRE inativo (aguardando aprovação do admin)
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    apelido = EXCLUDED.apelido,
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
WITH CHECK (public.is_admin() OR (auth.uid() = id AND role = 'morador'));

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
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
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
WITH CHECK (public.is_admin());

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

