import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { FaxinaService } from './services/faxinaService.ts';
import { createUserClient, db, runWithClient } from './db.ts';
import { REGRAS_PONTOS_PADRAO } from '../../src/types/faxina.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    brasiliaTime: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(new Date()),
  });
});

// ==============================================================================
// AUTENTICAÇÃO: valida o JWT do Supabase e executa a requisição em nome do usuário
// (RLS do banco aplica auth.uid() normalmente).
// ==============================================================================
app.use('/api/faxina', async (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    // Permite leitura pública para endpoints GET
    if (req.method === 'GET') {
      return next();
    }
    return res.status(401).json({ error: 'Sessão ausente. Faça login novamente.' });
  }

  try {
    const client = createUserClient(token);
    const { data: userData, error: userErr } = await client.auth.getUser(token);
    if (!userErr && userData?.user) {
      const { data: profile } = await client
        .from('profiles')
        .select('id, role, ativo, quarto_id')
        .eq('id', userData.user.id)
        .maybeSingle();

      res.locals.profile = profile || { id: userData.user.id, role: 'morador', ativo: true };
      return runWithClient(client, () => next());
    }
  } catch (err) {
    console.warn('[Backend Auth] Erro ao validar token:', err);
  }

  if (req.method === 'GET') {
    return next();
  }
  return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
});

/** Bloqueia rotas administrativas para quem não é admin. */
const requireAdmin: express.RequestHandler = (_req, res, next) => {
  if (res.locals.profile && res.locals.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas o Administrador pode executar esta ação.' });
  }
  next();
};

// Quadro Consolidado da Semana (Escala, Pontos e Tarefas de Hoje)
app.get('/api/faxina/quadro', async (_req, res) => {
  try {
    const quadro = await FaxinaService.obterQuadroConsolidado();
    res.json(quadro);
  } catch (error: any) {
    console.error('[API /api/faxina/quadro] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao obter quadro consolidado' });
  }
});

const FUNCOES_CANONICAS = [
  { nome: 'Sala de TV', descricao: 'Organização diária e recolhimento de itens na Sala de TV' },
  { nome: 'Sala de Estudos', descricao: 'Limpeza de mesas, cadeiras e organização do espaço de estudos' },
  { nome: 'Externo', descricao: 'Limpeza e recolhimento de materiais na área externa' },
  { nome: 'Dispensa', descricao: 'Organização das prateleiras e mantimentos na dispensa' },
  { nome: 'Cozinha', descricao: 'Organização de pias, bancadas e recolhimento de louças' },
  { nome: 'Halls', descricao: 'Limpeza dos corredores e fiscalização diária das outras 5 funções da casa' },
];

const QUARTOS_CANONICOS = [
  { nome: 'Carandiru', capacidade: 4 },
  { nome: 'High School', capacidade: 3 },
  { nome: 'Principal', capacidade: 3 },
  { nome: 'Quádruplo', capacidade: 4 },
  { nome: 'Triplo', capacidade: 3 },
  { nome: 'Varanda', capacidade: 3 },
];

// Quartos e Áreas para Configuração Inicial (leitura pública para exibição do formulário)
app.get('/api/faxina/dados-iniciais', async (_req, res) => {
  try {
    let [roomsRes, areasRes] = await Promise.all([
      db().from('rooms').select('id, nome, capacidade').order('nome'),
      db().from('areas_comuns').select('id, nome, descricao'),
    ]);

    let rooms = roomsRes.data || [];
    let areas = areasRes.data || [];

    // Se rooms estiver vazio, tenta semear os quartos canônicos da república
    if (rooms.length === 0) {
      await db().from('rooms').upsert(QUARTOS_CANONICOS, { onConflict: 'nome' });
      const r = await db().from('rooms').select('id, nome, capacidade').order('nome');
      rooms = r.data || [];
    }

    // Se areas estiver vazio, tenta semear as 6 áreas canônicas da casa
    if (areas.length === 0) {
      await db().from('areas_comuns').upsert(FUNCOES_CANONICAS, { onConflict: 'nome' });
      const a = await db().from('areas_comuns').select('id, nome, descricao');
      areas = a.data || [];
    }

    res.json({ rooms, areas });
  } catch (error: any) {
    console.error('[API /api/faxina/dados-iniciais] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao carregar dados' });
  }
});

// Buscar Regras de Penalidades (2 a 7 Pontos)
app.get('/api/faxina/regras', async (_req, res) => {
  try {
    const { data: regrasDb } = await db()
      .from('regras_quadro_pontos')
      .select('pontos, descricao')
      .order('pontos');

    const regras = (regrasDb && regrasDb.length > 0) ? regrasDb : REGRAS_PONTOS_PADRAO;
    res.json({ regras });
  } catch (error: any) {
    console.error('[API /api/faxina/regras] Erro:', error);
    res.json({ regras: REGRAS_PONTOS_PADRAO });
  }
});

// Configurar Regras de Penalidades (2 a 7 Pontos) - Admin
app.post('/api/faxina/regras', requireAdmin, async (req, res) => {
  try {
    const { regras } = req.body;
    if (!regras || !Array.isArray(regras)) {
      return res.status(400).json({ error: 'Array de regras inválido.' });
    }
    const profile = res.locals.profile;
    const salvas = await FaxinaService.salvarRegrasPontos(regras, profile?.id);
    res.json({ success: true, regras: salvas });
  } catch (error: any) {
    console.error('[API POST /api/faxina/regras] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao salvar regras' });
  }
});

// Inicialização da Escala da Casa (Admin)
app.post('/api/faxina/inicializar', requireAdmin, async (req, res) => {
  try {
    const { atribuicoes, penalidade, regras_pontos } = req.body;
    if (!atribuicoes || atribuicoes.length < 6) {
      return res.status(400).json({ error: 'É necessário atribuir os 6 quartos às 6 funções.' });
    }
    const profile = res.locals.profile;
    await FaxinaService.inicializarEscala(atribuicoes, penalidade, regras_pontos, profile?.id);
    const quadro = await FaxinaService.obterQuadroConsolidado();
    res.json({ success: true, quadro });
  } catch (error: any) {
    console.error('[API /api/faxina/inicializar] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao inicializar escala' });
  }
});

// Envio da Foto de Faxina pelo Quarto Responsável
app.post('/api/faxina/enviar-foto', async (req, res) => {
  try {
    const profile = res.locals.profile;
    const { quarto_id, area_comum_id, foto_url } = req.body;
    if (!quarto_id || !area_comum_id || !foto_url) {
      return res.status(400).json({ error: 'Parâmetros incompletos para envio da foto.' });
    }
    if (profile.role !== 'admin' && profile.quarto_id !== quarto_id) {
      return res.status(403).json({ error: 'Você só pode enviar a foto da função do seu próprio quarto.' });
    }
    await FaxinaService.enviarFotoFaxina({ quarto_id, area_comum_id, foto_url, morador_id: profile.id });
    res.json({ success: true, message: 'Foto de faxina enviada com sucesso!' });
  } catch (error: any) {
    console.error('[API /api/faxina/enviar-foto] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao enviar foto' });
  }
});

// Fiscalização pelo Halls (Aprovação ou Reprovação)
app.post('/api/faxina/fiscalizar', async (req, res) => {
  try {
    const profile = res.locals.profile;
    const { quarto_id, area_comum_id, data, fiscal_status, fiscal_foto_url, fiscal_observacao } = req.body;

    if (!quarto_id || !area_comum_id || !data || !['aprovado', 'reprovado'].includes(fiscal_status)) {
      return res.status(400).json({ error: 'Parâmetros incompletos para fiscalização.' });
    }

    if (profile.role !== 'admin') {
      const quadro = await FaxinaService.obterQuadroConsolidado();
      if (!quadro.quarto_fiscal_id || profile.quarto_id !== quadro.quarto_fiscal_id) {
        return res.status(403).json({ error: 'Apenas o quarto do Halls (fiscal da semana) pode fiscalizar.' });
      }
    }

    await FaxinaService.fiscalizarTarefa({
      quarto_id,
      area_comum_id,
      data,
      fiscal_status,
      fiscal_foto_url,
      fiscal_observacao,
      fiscal_morador_id: profile.id,
    });

    res.json({ success: true, message: 'Fiscalização registrada com sucesso!' });
  } catch (error: any) {
    console.error('[API /api/faxina/fiscalizar] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao registrar fiscalização' });
  }
});

// Trigger Manual para testes: Corte Diário das 01:00 BRT
app.post('/api/faxina/admin/virada-01h', requireAdmin, async (req, res) => {
  try {
    const { dataReferencia } = req.body || {};
    const resultado = await FaxinaService.processarCorteDiario01h(dataReferencia);
    res.json({ success: true, resultado });
  } catch (error: any) {
    console.error('[API virada-01h] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar corte das 01h' });
  }
});

// Trigger Manual para testes: Auditoria do Fiscal das 11:00 BRT
app.post('/api/faxina/admin/auditoria-11h', requireAdmin, async (req, res) => {
  try {
    const { dataReferencia } = req.body || {};
    const resultado = await FaxinaService.processarAuditoriaFiscal11h(dataReferencia);
    res.json({ success: true, resultado });
  } catch (error: any) {
    console.error('[API auditoria-11h] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar auditoria das 11h' });
  }
});

// ==============================================================================
// ROTINAS AGENDADAS (CRON) COM TIMEZONE BRASÍLIA (America/Sao_Paulo)
// ==============================================================================

// 1. Corte diário das 01:00 BRT:
// Verifica fotos faltantes do dia anterior e avança o rodízio aos domingos
cron.schedule(
  '0 1 * * *',
  async () => {
    console.log('[CRON 01:00 BRT] Executando corte diário da faxina...');
    try {
      const res = await FaxinaService.processarCorteDiario01h();
      console.log('[CRON 01:00 BRT] Concluído com sucesso:', res);
    } catch (err) {
      console.error('[CRON 01:00 BRT] Falha na execução:', err);
    }
  },
  { timezone: 'America/Sao_Paulo' }
);

// 2. Auditoria do Fiscal das 11:00 BRT:
// Aplica falta ao quarto do Halls caso alguma tarefa concluída ontem não tenha sido avaliada
cron.schedule(
  '0 11 * * *',
  async () => {
    console.log('[CRON 11:00 BRT] Executando auditoria do fiscal da faxina...');
    try {
      const res = await FaxinaService.processarAuditoriaFiscal11h();
      console.log('[CRON 11:00 BRT] Concluído com sucesso:', res);
    } catch (err) {
      console.error('[CRON 11:00 BRT] Falha na execução:', err);
    }
  },
  { timezone: 'America/Sao_Paulo' }
);

app.listen(PORT, () => {
  console.log(`[Canta Grillo Backend] Servidor rodando na porta ${PORT}`);
  console.log(`[Canta Grillo Backend] Rotinas agendadas (01:00 BRT e 11:00 BRT) ativas.`);
});
