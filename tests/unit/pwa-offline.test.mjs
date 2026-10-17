import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatform,
  checkIsStandalone,
  isBannerDismissed,
  dismissBanner,
  resetBannerDismissed,
  PWA_BANNER_DISMISSED_KEY,
} from '../../src/hooks/usePWA.ts';
import { workboxConfig } from '../../vite.config.ts';

describe('Unit Tests: PWA, Instalação e Cache Offline (Feature 4)', () => {
  describe('1. Detecção de Plataforma (iOS vs Android vs Desktop)', () => {
    it('deve identificar iPhone como iOS', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const result = detectPlatform(ua, 'iPhone', 5);
      assert.equal(result.isIOS, true);
      assert.equal(result.isAndroid, false);
    });

    it('deve identificar iPad como iOS', () => {
      const ua =
        'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
      const result = detectPlatform(ua, 'iPad', 5);
      assert.equal(result.isIOS, true);
      assert.equal(result.isAndroid, false);
    });

    it('deve identificar iPadOS moderno (que se passa por MacIntel com touch)', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15';
      const result = detectPlatform(ua, 'MacIntel', 5);
      assert.equal(result.isIOS, true);
      assert.equal(result.isAndroid, false);
    });

    it('deve identificar Android Chrome corretamente', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
      const result = detectPlatform(ua, 'Linux armv8l', 5);
      assert.equal(result.isIOS, false);
      assert.equal(result.isAndroid, true);
    });

    it('deve identificar Desktop (macOS/Windows) como não-móvel', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const result = detectPlatform(ua, 'MacIntel', 0);
      assert.equal(result.isIOS, false);
      assert.equal(result.isAndroid, false);
    });
  });

  describe('2. Detecção de Modo Standalone (PWA Instalado)', () => {
    it('deve detectar standalone no iOS quando navigator.standalone é true', () => {
      const mockNav = { standalone: true };
      const mockWin = { matchMedia: () => ({ matches: false }) };
      assert.equal(checkIsStandalone(mockWin, mockNav), true);
    });

    it('deve detectar standalone no Android/Chrome via matchMedia(display-mode: standalone)', () => {
      const mockNav = { standalone: false };
      const mockWin = {
        matchMedia: (q) => ({
          matches: q.includes('display-mode: standalone'),
        }),
      };
      assert.equal(checkIsStandalone(mockWin, mockNav), true);
    });

    it('deve retornar false quando aberto no navegador comum', () => {
      const mockNav = { standalone: false };
      const mockWin = {
        matchMedia: () => ({ matches: false }),
      };
      assert.equal(checkIsStandalone(mockWin, mockNav), false);
    });
  });

  describe('3. Persistência de Dispensa do Banner da Home (localStorage)', () => {
    function createMockStorage() {
      const store = new Map();
      return {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => {
          store.set(k, String(v));
        },
        removeItem: (k) => {
          store.delete(k);
        },
        clear: () => store.clear(),
        key: (_index) => null,
        length: store.size,
      };
    }

    it('deve iniciar com banner não dispensado', () => {
      const storage = createMockStorage();
      assert.equal(isBannerDismissed(storage), false);
    });

    it('deve persistir a dispensa do banner com a chave correta', () => {
      const storage = createMockStorage();
      dismissBanner(storage);
      assert.equal(storage.getItem(PWA_BANNER_DISMISSED_KEY), 'true');
      assert.equal(isBannerDismissed(storage), true);
    });

    it('deve permitir resetar a dispensa do banner', () => {
      const storage = createMockStorage();
      dismissBanner(storage);
      assert.equal(isBannerDismissed(storage), true);
      resetBannerDismissed(storage);
      assert.equal(isBannerDismissed(storage), false);
    });
  });

  describe('4. Configuração Workbox no vite.config.ts', () => {
    it('deve conter globPatterns cobrindo assets estáticos, fontes e ícones', () => {
      assert.ok(Array.isArray(workboxConfig.globPatterns));
      assert.ok(
        workboxConfig.globPatterns.some((pattern) =>
          pattern.includes('woff2') && pattern.includes('svg') && pattern.includes('png')
        ),
        'globPatterns deve incluir woff2, svg e png'
      );
    });

    it('deve configurar rota de cache NetworkFirst para Supabase REST API', () => {
      const apiRoute = workboxConfig.runtimeCaching.find((r) =>
        r.options.cacheName === 'supabase-api-cache'
      );
      assert.ok(apiRoute, 'Rota supabase-api-cache deve existir');
      assert.equal(apiRoute.handler, 'NetworkFirst');
      assert.equal(apiRoute.options.networkTimeoutSeconds, 4);
      assert.equal(apiRoute.options.expiration?.maxAgeSeconds, 24 * 60 * 60);

      // Testa se o regex casa URLs reais do Supabase
      const urlSupabase = 'https://abc123xyz.supabase.co/rest/v1/daily_meals?select=*';
      const regex = apiRoute.urlPattern;
      assert.ok(regex.test(urlSupabase), 'urlPattern deve casar URLs de /rest/v1/');
    });

    it('deve configurar rota de cache CacheFirst para Supabase Storage', () => {
      const storageRoute = workboxConfig.runtimeCaching.find((r) =>
        r.options.cacheName === 'supabase-storage-images'
      );
      assert.ok(storageRoute, 'Rota supabase-storage-images deve existir');
      assert.equal(storageRoute.handler, 'CacheFirst');
      assert.equal(storageRoute.options.expiration?.maxEntries, 150);
      assert.equal(storageRoute.options.expiration?.maxAgeSeconds, 7 * 24 * 60 * 60);

      // Testa se o regex casa URLs reais do Supabase Storage
      const urlFoto =
        'https://abc123xyz.supabase.co/storage/v1/object/public/pontos/foto-bagunca.webp';
      const regex = storageRoute.urlPattern;
      assert.ok(regex.test(urlFoto), 'urlPattern deve casar URLs de /storage/v1/object/public/');
    });
  });

  describe('5. Diferenciação de Tutoriais por Plataforma (iOS vs Android)', () => {
    it('deve direcionar iOS para modal do Safari (Compartilhar -> Tela de Início)', () => {
      const { isIOS, isAndroid } = detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)', 'iPhone', 5);
      assert.equal(isIOS, true);
      assert.equal(isAndroid, false);

      const targetModal = isIOS ? 'ios' : 'android';
      assert.equal(targetModal, 'ios');
    });

    it('deve direcionar Android para modal do Chrome (Três pontos -> Instalar aplicativo)', () => {
      const { isIOS, isAndroid } = detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 7...)', 'Linux armv8l', 5);
      assert.equal(isIOS, false);
      assert.equal(isAndroid, true);

      const targetModal = isIOS ? 'ios' : 'android';
      assert.equal(targetModal, 'android');
    });

    it('deve fornecer fallback seguro para navegadores Desktop ou desconhecidos', () => {
      const { isIOS } = detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0);
      const targetModal = isIOS ? 'ios' : 'android';
      assert.equal(targetModal, 'android');
    });
  });
});
