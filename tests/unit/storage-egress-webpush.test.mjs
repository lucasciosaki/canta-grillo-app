import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unit Tests: Otimização de Egress, Storage e Web Push em Segundo Plano', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('1. Verificação de Integridade do Schema SQL (Buckets, TTL, Índices)', () => {
    it('o arquivo supabase/schema.sql deve conter a criação dos 4 buckets públicos', () => {
      const schemaSql = fs.readFileSync(path.join(rootDir, 'supabase/schema.sql'), 'utf-8');

      assert.ok(schemaSql.includes("VALUES ('avatars', 'avatars', true)"), 'Bucket avatars');
      assert.ok(schemaSql.includes("VALUES ('pontos_bagunca', 'pontos_bagunca', true)"), 'Bucket pontos_bagunca');
      assert.ok(schemaSql.includes("VALUES ('funcas', 'funcas', true)"), 'Bucket funcas');
      assert.ok(schemaSql.includes("VALUES ('faxina', 'faxina', true)"), 'Bucket faxina');
      assert.ok(
        schemaSql.includes("bucket_id IN ('avatars', 'pontos_bagunca', 'funcas', 'faxina')"),
        'Políticas de SELECT público para todos os 4 buckets'
      );
    });

    it('o arquivo supabase/schema.sql deve conter as tabelas push_subscriptions e notifications com TTL', () => {
      const schemaSql = fs.readFileSync(path.join(rootDir, 'supabase/schema.sql'), 'utf-8');

      assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.push_subscriptions'), 'Tabela push_subscriptions');
      assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS public.notifications'), 'Tabela notifications');
      assert.ok(schemaSql.includes("expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')"), 'Campo expires_at com TTL');
      assert.ok(schemaSql.includes('CREATE OR REPLACE FUNCTION public.limpar_notificacoes_antigas()'), 'Função limpar_notificacoes_antigas');
      assert.ok(schemaSql.includes('limpeza_diaria_notificacoes'), 'Cron de limpeza diária agendado');
    });

    it('o arquivo supabase/schema.sql deve conter índices de performance para redução de latência', () => {
      const schemaSql = fs.readFileSync(path.join(rootDir, 'supabase/schema.sql'), 'utf-8');

      assert.ok(schemaSql.includes('idx_daily_meals_data_usuario'), 'Índice daily_meals(data, usuario_id)');
      assert.ok(schemaSql.includes('idx_registro_faxina_data_quarto'), 'Índice registro_diario_faxina(data, quarto_id)');
      assert.ok(schemaSql.includes('idx_pontos_bagunca_status_created'), 'Índice pontos_bagunca(status, created_at DESC)');
      assert.ok(schemaSql.includes('idx_mensagens_frente_frente_enviada'), 'Índice mensagens_frente');
    });
  });

  describe('2. Verificação de Código Front-end (Zero Base64 no Banco & Queries Otimizadas)', () => {
    it('useNotifications.ts NÃO deve realizar SELECT * pesado nas tabelas com fotos/mídias', () => {
      const hookContent = fs.readFileSync(path.join(rootDir, 'src/hooks/useNotifications.ts'), 'utf-8');

      assert.ok(
        !hookContent.includes(".from('pontos_bagunca').select('*')"),
        'pontos_bagunca não deve usar select(*)'
      );
      assert.ok(
        !hookContent.includes(".from('registro_diario_faxina').select('*')"),
        'registro_diario_faxina não deve usar select(*)'
      );
      assert.ok(
        hookContent.includes('Promise.all'),
        'useNotifications deve paralelizar consultas com Promise.all'
      );
      assert.ok(
        hookContent.includes('lastEvaluationContextRef'),
        'useNotifications deve manter cache em memória para o timer de 60s'
      );
    });

    it('telas de cadastro de mídia devem utilizar o serviço uploadImageToBucket', () => {
      const denunciaPonto = fs.readFileSync(path.join(rootDir, 'src/features/pontos/DenunciaPontoScreen.tsx'), 'utf-8');
      const novaFunca = fs.readFileSync(path.join(rootDir, 'src/features/funcas/NovaFuncaModal.tsx'), 'utf-8');
      const quadroPontos = fs.readFileSync(path.join(rootDir, 'src/features/faxina/QuadroPontosScreen.tsx'), 'utf-8');

      assert.ok(denunciaPonto.includes("uploadImageToBucket({\n          bucket: 'pontos_bagunca'"), 'DenunciaPontoScreen usa uploadImageToBucket');
      assert.ok(novaFunca.includes("uploadImageToBucket({\n          bucket: 'funcas'"), 'NovaFuncaModal usa uploadImageToBucket');
      assert.ok(quadroPontos.includes("uploadImageToBucket({\n        bucket: 'faxina'"), 'QuadroPontosScreen usa uploadImageToBucket');
    });

    it('Service Worker push handler (public/push-sw.js) deve estar presente e escutar eventos push e notificationclick', () => {
      const swContent = fs.readFileSync(path.join(rootDir, 'public/push-sw.js'), 'utf-8');

      assert.ok(swContent.includes("addEventListener('push'"), 'Listener de push em background');
      assert.ok(swContent.includes("addEventListener('notificationclick'"), 'Listener de clique na notificação');
    });

    it('useNotifications.ts NÃO deve disparar sendBrowserPush (push nativo exclusivo via Edge Function send-push)', () => {
      const hookContent = fs.readFileSync(path.join(rootDir, 'src/hooks/useNotifications.ts'), 'utf-8');
      assert.ok(
        !hookContent.includes('sendBrowserPush'),
        'useNotifications.ts não deve conter chamadas a sendBrowserPush (pushes vêm exclusivamente da Edge Function send-push)'
      );

      const edgeFunctionContent = fs.readFileSync(path.join(rootDir, 'supabase/functions/send-push/index.ts'), 'utf-8');
      assert.ok(edgeFunctionContent.includes('front_id'), 'Edge Function send-push suporta front_id');
      assert.ok(edgeFunctionContent.includes('front_slug'), 'Edge Function send-push suporta front_slug');
      assert.ok(edgeFunctionContent.includes("role === 'admin'"), 'Edge Function send-push suporta role admin');
      assert.ok(edgeFunctionContent.includes('quarto_id'), 'Edge Function send-push suporta quarto_id');
      assert.ok(edgeFunctionContent.includes('except_user_id'), 'Edge Function send-push suporta except_user_id');

      const browserPushContent = fs.readFileSync(path.join(rootDir, 'src/utils/browserPush.ts'), 'utf-8');
      assert.ok(browserPushContent.includes('front_id?: string;'), 'RemoteWebPushRequest suporta front_id');
      assert.ok(browserPushContent.includes('role?: \'admin\';'), 'RemoteWebPushRequest suporta role admin');
      assert.ok(browserPushContent.includes('quarto_id?: string;'), 'RemoteWebPushRequest suporta quarto_id');
    });

    it('Abordagem 2: Telas do front-end NÃO devem disparar triggerRemoteWebPush diretamente (Database-First puro)', () => {
      const telasParaChecar = [
        'src/App.tsx',
        'src/features/pontos/DenunciaPontoScreen.tsx',
        'src/features/cervejas/CervejasScreen.tsx',
        'src/features/faxina/QuadroPontosScreen.tsx',
        'src/features/frentes/FrentesScreen.tsx',
        'src/features/frentes/components/FrenteChatTab.tsx',
        'src/features/frentes/components/FrenteMercadoTab.tsx',
        'src/features/frentes/components/FrentePainelTab.tsx',
        'src/features/funcas/FuncasScreen.tsx',
        'src/features/funcas/NovaFuncaModal.tsx',
      ];

      for (const relPath of telasParaChecar) {
        const content = fs.readFileSync(path.join(rootDir, relPath), 'utf-8');
        assert.ok(
          !content.includes('triggerRemoteWebPush'),
          `${relPath} não deve chamar triggerRemoteWebPush diretamente no front-end`
        );
      }
    });

    it('Abordagem 2: send-push deve aceitar payloads de Database Webhook com blindagem de autenticidade no banco', () => {
      const edgeFunctionContent = fs.readFileSync(path.join(rootDir, 'supabase/functions/send-push/index.ts'), 'utf-8');

      assert.ok(
        edgeFunctionContent.includes("body.table === 'notifications'"),
        'send-push deve reconhecer webhooks na tabela notifications'
      );
      assert.ok(
        edgeFunctionContent.includes('WEBHOOK_SECRET'),
        'send-push deve checar WEBHOOK_SECRET para webhooks autorizados'
      );
      assert.ok(
        edgeFunctionContent.includes('.from(\'notifications\')'),
        'send-push deve validar autenticidade da notificação no banco de dados'
      );
    });

    it('Abordagem 2: supabase/schema.sql deve conter os triggers server-driven para alimentar public.notifications', () => {
      const schemaSql = fs.readFileSync(path.join(rootDir, 'supabase/schema.sql'), 'utf-8');

      const triggersObrigatorios = [
        'trg_notify_pontos_bagunca',
        'trg_notify_mensagens_ponto_bagunca',
        'trg_notify_mensagens_frente',
        'trg_notify_funca_atribuicoes',
        'trg_notify_caixas_cerveja',
        'trg_notify_funcas',
        'trg_notify_solicitacoes_mercado',
        'trg_notify_front_members',
        'trg_notify_registro_diario_faxina',
      ];

      for (const trg of triggersObrigatorios) {
        assert.ok(schemaSql.includes(trg), `schema.sql deve conter o trigger ${trg}`);
      }
    });
  });
});
