const STORAGE_KEY_NOTIFIED = 'canta_grillo_notified_events_v1';

export interface PushNotificationOptions {
  id: string;
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
}

// Fallback em memória para ambientes sem localStorage (ex: SSR / Node tests)
let inMemoryNotified: Record<string, number> = {};

function getLocalStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

/**
 * Retorna true se a Notification API estiver disponível no ambiente atual.
 */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Obtém o status de permissão atual de notificações do navegador.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Solicita autorização ao usuário para exibir notificações nativas do navegador.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    console.warn('[BrowserPush] Notificações nativas não são suportadas neste navegador.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('[BrowserPush] Erro ao solicitar permissão de notificações:', err);
    return 'denied';
  }
}

/**
 * Lê o conjunto de IDs de eventos já notificados do localStorage ou memória.
 */
function getNotifiedEventsMap(): Record<string, number> {
  const storage = getLocalStorage();
  if (!storage) return { ...inMemoryNotified };
  try {
    const raw = storage.getItem(STORAGE_KEY_NOTIFIED);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[BrowserPush] Falha ao ler cache de eventos notificados:', err);
    return { ...inMemoryNotified };
  }
}

/**
 * Salva o mapa de eventos notificados no localStorage ou memória.
 */
function saveNotifiedEventsMap(map: Record<string, number>): void {
  inMemoryNotified = { ...map };
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_NOTIFIED, JSON.stringify(map));
  } catch (err) {
    console.warn('[BrowserPush] Falha ao persistir cache de eventos notificados:', err);
  }
}

/**
 * Verifica se um evento com o determinado ID já disparou push neste aparelho.
 */
export function hasBeenPushed(id: string): boolean {
  const map = getNotifiedEventsMap();
  return Boolean(map[id]);
}

/**
 * Marca um evento como notificado para evitar múltiplos disparos.
 */
export function markAsPushed(id: string): void {
  const map = getNotifiedEventsMap();
  map[id] = Date.now();
  saveNotifiedEventsMap(map);
}

/**
 * Limpa o histórico de eventos notificados (útil em testes ou reset).
 */
export function clearPushedEvents(): void {
  inMemoryNotified = {};
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY_NOTIFIED);
  } catch (err) {
    console.warn('[BrowserPush] Erro ao limpar histórico de eventos:', err);
  }
}

/**
 * Remove registros com mais de 7 dias ou limita tamanho para não sobrecarregar localStorage.
 */
export function prunePushedEvents(maxAgeDays = 7): void {
  const map = getNotifiedEventsMap();
  const agora = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let alterado = false;

  for (const [id, timestamp] of Object.entries(map)) {
    if (agora - timestamp > maxAgeMs) {
      delete map[id];
      alterado = true;
    }
  }

  if (alterado) {
    saveNotifiedEventsMap(map);
  }
}

/**
 * Remove um evento específico do mapa de notificados (caso o disparo falhe).
 */
function unmarkAsPushed(id: string): void {
  const map = getNotifiedEventsMap();
  if (map[id]) {
    delete map[id];
    saveNotifiedEventsMap(map);
  }
}

/**
 * Obtém o ServiceWorkerRegistration ativo ou registra /push-sw.js como fallback
 * (necessário em Android Chrome e ambientes dev/túnel sem bloqueio infinito em .ready).
 */
async function getOrRegisterServiceWorker(timeoutMs = 2500): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/push-sw.js').catch(() => undefined);
    }
    if (reg && reg.active) {
      return reg;
    }

    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    return readyReg || reg || null;
  } catch {
    return null;
  }
}

/**
 * Dispara uma notificação nativa do navegador (Browser Push).
 * Garante deduplicação persistente via localStorage antes de acionar.
 */
export async function sendBrowserPush(options: PushNotificationOptions): Promise<boolean> {
  const { id, title, body, tag, url, icon = '/logo.png', badge = '/logo.png' } = options;

  // 1. Verifica deduplicação
  if (hasBeenPushed(id)) {
    return false;
  }

  // 2. Verifica suporte e permissão
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return false;
  }

  // 3. Marca como notificado imediatamente para evitar concorrência
  markAsPushed(id);

  try {
    // Tenta via Service Worker registration (obrigatório em PWA Android/iOS)
    const reg = await getOrRegisterServiceWorker(2500);
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, {
        body,
        icon,
        badge,
        tag: tag || id,
        vibrate: [100, 50, 100],
        data: { url: url || '/' },
      } as NotificationOptions);
      return true;
    }
  } catch (swErr) {
    console.warn('[BrowserPush] Falha ao disparar via ServiceWorker, tentando fallback direto:', swErr);
  }

  // Fallback: Construtor clássico Notification (Desktop / navegadores compatíveis)
  try {
    const notif = new Notification(title, {
      body,
      icon,
      tag: tag || id,
    });

    if (url) {
      notif.onclick = () => {
        window.focus();
        window.location.href = url;
      };
    }
    return true;
  } catch (fallbackErr) {
    unmarkAsPushed(id);
    console.error('[BrowserPush] Falha ao disparar notificação via Notification API:', fallbackErr);
    return false;
  }
}

/**
 * Converte chave pública VAPID de base64url para Uint8Array exigido pelo pushManager.subscribe.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Inscreve o navegador/dispositivo no PushManager do Service Worker e registra
 * as credenciais criptográficas (VAPID) na tabela public.push_subscriptions do Supabase.
 */
export async function subscribeToWebPush(userId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[WebPush] PushManager ou ServiceWorker não suportado no navegador.');
    return false;
  }

  try {
    const vapidPublicKey =
      import.meta.env.VITE_VAPID_PUBLIC_KEY ||
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

    const reg = await getOrRegisterServiceWorker(3000);
    if (!reg || !reg.pushManager) {
      return false;
    }
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      throw new Error('Inscrição Web Push incompleta retornada pelo navegador.');
    }

    const { supabase } = await import('../lib/supabaseClient');
    const { error: upsertErr } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 255) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (upsertErr) {
      console.warn('[WebPush] Falha ao salvar push_subscription no Supabase:', upsertErr);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[WebPush] Erro ao registrar inscrição Web Push:', err);
    return false;
  }
}

