import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('Unit Tests: Session Cache, Deduplication & Request Reduction', () => {
  describe('1. Verificação do Arquivo sessionDataCache.ts', () => {
    const cacheFile = path.join(rootDir, 'src/utils/sessionDataCache.ts');

    it('o arquivo sessionDataCache.ts deve existir e exportar fetchWithDedup e invalidateCache', () => {
      assert.ok(fs.existsSync(cacheFile), 'sessionDataCache.ts deve existir');
      const content = fs.readFileSync(cacheFile, 'utf-8');
      assert.ok(content.includes('export async function fetchWithDedup'), 'deve exportar fetchWithDedup');
      assert.ok(content.includes('export function invalidateCache'), 'deve exportar invalidateCache');
      assert.ok(content.includes('export async function getProfilesCached'), 'deve exportar getProfilesCached');
      assert.ok(content.includes('export async function getFrontsCached'), 'deve exportar getFrontsCached');
      assert.ok(content.includes('export async function getAreasComunsCached'), 'deve exportar getAreasComunsCached');
      assert.ok(content.includes('export async function getRoomsCached'), 'deve exportar getRoomsCached');
    });

    it('fetchWithDedup deve implementar controle de TTL e inFlightPromises', () => {
      const content = fs.readFileSync(cacheFile, 'utf-8');
      assert.ok(content.includes('inFlightPromises.has(key)'), 'deve deduplicar promises em voo');
      assert.ok(content.includes('memoryCache.set(key,'), 'deve armazenar em memoryCache');
      assert.ok(content.includes('memoryCache.clear()'), 'deve limpar memória em invalidateCache()');
    });
  });

  describe('2. Verificação de Otimizações em useNotifications.ts', () => {
    const notifFile = path.join(rootDir, 'src/hooks/useNotifications.ts');

    it('useNotifications.ts deve suportar carga granular por tabela em vez de buscar 17 tabelas sempre', () => {
      const content = fs.readFileSync(notifFile, 'utf-8');
      assert.ok(content.includes('tablesToRefresh?: Set<string>'), 'deve aceitar tablesToRefresh');
      assert.ok(content.includes('isGranular'), 'deve ter flag de execução granular');
      assert.ok(content.includes('triggerGranularRefresh'), 'deve ter gatilho granular debounced');
    });

    it('useNotifications.ts deve exportar forceRefresh e markPontoVisualizadoLocal', () => {
      const content = fs.readFileSync(notifFile, 'utf-8');
      assert.ok(content.includes('forceRefresh,'), 'hook deve retornar forceRefresh');
      assert.ok(content.includes('markPontoVisualizadoLocal,'), 'hook deve retornar markPontoVisualizadoLocal');
    });

    it('useNotifications.ts deve ter auto-refresh em visibilitychange e online', () => {
      const content = fs.readFileSync(notifFile, 'utf-8');
      assert.ok(content.includes("addEventListener('visibilitychange'"), 'deve monitorar visibilidade');
      assert.ok(content.includes("addEventListener('online'"), 'deve monitorar reconexão de rede');
    });
  });

  describe('3. Verificação de Otimizações na Home e Telas (App.tsx & Subtelas)', () => {
    const appFile = path.join(rootDir, 'src/App.tsx');
    const funcasFile = path.join(rootDir, 'src/features/funcas/FuncasScreen.tsx');
    const frentesFile = path.join(rootDir, 'src/features/frentes/FrentesScreen.tsx');
    const cervejasFile = path.join(rootDir, 'src/features/cervejas/CervejasScreen.tsx');
    const atasFile = path.join(rootDir, 'src/features/atas/AtasScreen.tsx');
    const quadroFile = path.join(rootDir, 'src/features/faxina/QuadroPontosScreen.tsx');

    it('App.tsx deve restringir daily_meals para a home e filtrar mensagens por pontos abertos', () => {
      const content = fs.readFileSync(appFile, 'utf-8');
      assert.ok(content.includes("screen !== 'home'"), 'daily_meals só deve rodar na home');
      assert.ok(content.includes('.in(\'ponto_bagunca_id\', pontosAbertosIds)'), 'mensagens só devem buscar pontos abertos');
      assert.ok(content.includes('handleForceRefreshAll'), 'deve implementar força refresh manual');
    });

    it('As telas de Funças, Frentes, Cervejas e Atas devem paralelizar consultas com Promise.all e cache', () => {
      const funcas = fs.readFileSync(funcasFile, 'utf-8');
      const frentes = fs.readFileSync(frentesFile, 'utf-8');
      const cervejas = fs.readFileSync(cervejasFile, 'utf-8');
      const atas = fs.readFileSync(atasFile, 'utf-8');

      assert.ok(funcas.includes('Promise.all(['), 'FuncasScreen deve usar Promise.all');
      assert.ok(funcas.includes('getProfilesCached'), 'FuncasScreen deve usar getProfilesCached');
      assert.ok(frentes.includes('Promise.all(['), 'FrentesScreen deve usar Promise.all');
      assert.ok(cervejas.includes('Promise.all(['), 'CervejasScreen deve usar Promise.all');
      assert.ok(atas.includes('Promise.all(['), 'AtasScreen deve usar Promise.all');
    });

    it('QuadroPontosScreen deve executar a RPC garantir_quadro_faxina_atual apenas 1 vez (hasEnsuredQuadroRef)', () => {
      const quadro = fs.readFileSync(quadroFile, 'utf-8');
      assert.ok(quadro.includes('hasEnsuredQuadroRef'), 'QuadroPontosScreen deve proteger a RPC com hasEnsuredQuadroRef');
    });
  });

  describe('4. Verificação dos Botões de Atualização Manual (Header e Central de Notificações)', () => {
    const headerFile = path.join(rootDir, 'src/components/layout/Header.tsx');
    const drawerFile = path.join(rootDir, 'src/features/notificacoes/NotificationsDrawer.tsx');

    it('Header.tsx deve renderizar o botão RefreshCw com suporte a isRefreshing', () => {
      const content = fs.readFileSync(headerFile, 'utf-8');
      assert.ok(content.includes('RefreshCw'), 'Header deve ter ícone RefreshCw');
      assert.ok(content.includes('onRefresh'), 'Header deve receber onRefresh');
      assert.ok(content.includes('isRefreshing'), 'Header deve receber isRefreshing');
    });

    it('NotificationsDrawer.tsx deve renderizar o botão RefreshCw com suporte a onRefresh', () => {
      const content = fs.readFileSync(drawerFile, 'utf-8');
      assert.ok(content.includes('RefreshCw'), 'NotificationsDrawer deve ter ícone RefreshCw');
      assert.ok(content.includes('onRefresh'), 'NotificationsDrawer deve receber onRefresh');
      assert.ok(content.includes('isRefreshing'), 'NotificationsDrawer deve receber isRefreshing');
    });
  });

  describe('5. Sincronização Mobile em Segundo Plano, Reconexão Realtime e Browser Push', () => {
    it('AuthContext.tsx deve sincronizar o JWT no Realtime via supabase.realtime.setAuth', () => {
      const authFile = path.join(rootDir, 'src/contexts/AuthContext.tsx');
      const content = fs.readFileSync(authFile, 'utf-8');
      assert.ok(
        content.includes('supabase.realtime.setAuth('),
        'AuthContext deve autenticar o socket Realtime com o access_token do morador'
      );
    });

    it('App.tsx e useNotifications.ts devem sincronizar ao retornar do bloqueio de tela no celular (visibilitychange, focus, pageshow)', () => {
      const appContent = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');
      const notifContent = fs.readFileSync(path.join(rootDir, 'src/hooks/useNotifications.ts'), 'utf-8');

      assert.ok(appContent.includes("addEventListener('visibilitychange'"), 'App.tsx deve escutar visibilitychange');
      assert.ok(appContent.includes("addEventListener('pageshow'"), 'App.tsx deve escutar pageshow');
      assert.ok(appContent.includes('canta-grillo:ponto-realtime'), 'App.tsx deve escutar evento customizado de ponto realtime');

      assert.ok(notifContent.includes("addEventListener('pageshow'"), 'useNotifications.ts deve escutar pageshow');
      assert.ok(notifContent.includes('ponto-novo-${novoPonto.id}'), 'useNotifications.ts deve disparar push imediato no INSERT de pontos_bagunca');
    });

    it('browserPush.ts deve usar getOrRegisterServiceWorker com timeout para não travar no Android/iOS', () => {
      const pushContent = fs.readFileSync(path.join(rootDir, 'src/utils/browserPush.ts'), 'utf-8');
      assert.ok(pushContent.includes('getOrRegisterServiceWorker'), 'deve usar helper resiliente de ServiceWorker');
      assert.ok(pushContent.includes("register('/push-sw.js')"), 'deve registrar /push-sw.js como fallback se ausente');
    });
  });
});
