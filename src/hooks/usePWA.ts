import { useState, useEffect, useCallback, useRef } from 'react';

export const PWA_BANNER_DISMISSED_KEY = 'canta_grillo_pwa_banner_dismissed_v1';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PlatformDetection {
  isIOS: boolean;
  isAndroid: boolean;
}

/**
 * Detecta a plataforma móvel (iOS / Android) a partir do User Agent e propriedades do navegador.
 */
export function detectPlatform(
  customUserAgent?: string,
  customPlatform?: string,
  customMaxTouchPoints?: number
): PlatformDetection {
  try {
    const ua =
      customUserAgent ??
      (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const platform =
      customPlatform ??
      (typeof navigator !== 'undefined' ? navigator.platform : '');
    const maxTouchPoints =
      customMaxTouchPoints ??
      (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);

    const isIOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (platform === 'MacIntel' && maxTouchPoints > 1);

    const isAndroid = /Android/i.test(ua);

    return { isIOS, isAndroid };
  } catch {
    return { isIOS: false, isAndroid: false };
  }
}

/**
 * Verifica se a aplicação está rodando em modo standalone (PWA instalado).
 */
export function checkIsStandalone(
  customWindow?: Window | { matchMedia?: (query: string) => { matches: boolean } },
  customNavigator?: any
): boolean {
  try {
    const win =
      customWindow !== undefined
        ? customWindow
        : typeof window !== 'undefined'
          ? window
          : undefined;
    const nav =
      customNavigator !== undefined
        ? customNavigator
        : typeof navigator !== 'undefined'
          ? navigator
          : undefined;

    // iOS Safari standalone
    if (nav && 'standalone' in nav && (nav as any).standalone === true) {
      return true;
    }

    // Android / Chrome / Desktop display-mode: standalone
    if (win && typeof win.matchMedia === 'function') {
      return win.matchMedia('(display-mode: standalone)').matches;
    }
  } catch {
    // fallback seguro
  }
  return false;
}

/**
 * Verifica se o banner da Home foi dispensado pelo usuário no localStorage.
 */
export function isBannerDismissed(storage?: Storage): boolean {
  try {
    const s =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    return s?.getItem(PWA_BANNER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Salva a dispensa do banner no localStorage.
 */
export function dismissBanner(storage?: Storage): void {
  try {
    const s =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    s?.setItem(PWA_BANNER_DISMISSED_KEY, 'true');
  } catch {
    // fallback seguro se localStorage estiver bloqueado
  }
}

/**
 * Reseta a dispensa do banner (útil para testes ou reativação).
 */
export function resetBannerDismissed(storage?: Storage): void {
  try {
    const s =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    s?.removeItem(PWA_BANNER_DISMISSED_KEY);
  } catch {
    // fallback seguro
  }
}

export interface UsePWAResult {
  isStandalone: boolean;
  isOnline: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  canPromptInstall: boolean;
  triggerInstallPrompt: () => Promise<boolean>;
  isHomeBannerDismissed: boolean;
  dismissHomeBanner: () => void;
  showHomeBanner: boolean;
  showCasaCard: boolean;
}

/**
 * Hook central para gerenciamento do ciclo de vida PWA, status de conexão e instalação nativa.
 */
export function usePWA(): UsePWAResult {
  const [isStandalone, setIsStandalone] = useState<boolean>(() =>
    checkIsStandalone()
  );

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  const [isHomeBannerDismissed, setIsHomeBannerDismissed] = useState<boolean>(
    () => isBannerDismissed()
  );

  const [canPromptInstall, setCanPromptInstall] = useState<boolean>(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [{ isIOS, isAndroid }] = useState<PlatformDetection>(() =>
    detectPlatform()
  );

  // Monitora alterações de conectividade (online / offline)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitora transição para modo standalone (display-mode)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    } else if (typeof (mediaQuery as any).addListener === 'function') {
      (mediaQuery as any).addListener(handleMediaChange);
      return () => (mediaQuery as any).removeListener(handleMediaChange);
    }
  }, []);

  // Captura evento nativo beforeinstallprompt do Android/Chrome
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Previne a barra padrão do browser para usar o componente editorial
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanPromptInstall(true);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      deferredPromptRef.current = null;
      setCanPromptInstall(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Dispara o prompt nativo de instalação
  const triggerInstallPrompt = useCallback(async (): Promise<boolean> => {
    if (!deferredPromptRef.current) {
      return false;
    }

    try {
      const promptEvent = deferredPromptRef.current;
      await promptEvent.prompt();
      const choiceResult = await promptEvent.userChoice;

      deferredPromptRef.current = null;
      setCanPromptInstall(false);

      return choiceResult.outcome === 'accepted';
    } catch (err) {
      console.error('[usePWA] Erro ao disparar prompt de instalação:', err);
      return false;
    }
  }, []);

  // Dispensa o banner da Home e persiste a preferência
  const dismissHomeBanner = useCallback(() => {
    dismissBanner();
    setIsHomeBannerDismissed(true);
  }, []);

  return {
    isStandalone,
    isOnline,
    isIOS,
    isAndroid,
    canPromptInstall,
    triggerInstallPrompt,
    isHomeBannerDismissed,
    dismissHomeBanner,
    showHomeBanner: !isStandalone && !isHomeBannerDismissed,
    showCasaCard: !isStandalone,
  };
}
