import { supabase } from '../lib/supabaseClient';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightPromises = new Map<string, Promise<any>>();

/**
 * Executa uma consulta assíncrona com deduplicação de promessas em voo
 * e cache em memória (RAM) temporário.
 */
export async function fetchWithDedup<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 60_000
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);

  if (cached && now - cached.timestamp < cached.ttlMs) {
    return cached.data as T;
  }

  // Deduplicação de requisições simultâneas em voo
  if (inFlightPromises.has(key)) {
    return inFlightPromises.get(key) as Promise<T>;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      memoryCache.set(key, { data, timestamp: Date.now(), ttlMs });
      return data;
    } finally {
      inFlightPromises.delete(key);
    }
  })();

  inFlightPromises.set(key, promise);
  return promise;
}

/**
 * Invalida chaves do cache em memória que comecem com o prefixo informado.
 * Se nenhum prefixo for passado, limpa todo o cache em memória.
 */
export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(keyPrefix)) {
      memoryCache.delete(k);
    }
  }
}

/**
 * Busca perfis com cache em memória (TTL padrão 5 minutos)
 */
export async function getProfilesCached<T = any>(columns = 'id, nome, apelido, role, ativo, quarto_id'): Promise<T[]> {
  return fetchWithDedup(`profiles:${columns}`, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(columns as any)
      .order('nome');
    if (error) throw error;
    return (data as unknown as T[]) || [];
  }, 300_000);
}

/**
 * Busca frentes com cache em memória (TTL padrão 10 minutos)
 */
export async function getFrontsCached<T = any>(): Promise<T[]> {
  return fetchWithDedup('fronts:all', async () => {
    const { data, error } = await supabase
      .from('fronts')
      .select('id, nome, slug')
      .order('nome');
    if (error) throw error;
    return (data as unknown as T[]) || [];
  }, 600_000);
}

/**
 * Busca áreas comuns com cache em memória (TTL padrão 10 minutos)
 */
export async function getAreasComunsCached<T = any>(): Promise<T[]> {
  return fetchWithDedup('areas_comuns:all', async () => {
    const { data, error } = await supabase
      .from('areas_comuns')
      .select('id, nome, descricao');
    if (error) throw error;
    return (data as unknown as T[]) || [];
  }, 600_000);
}

/**
 * Busca quartos com cache em memória (TTL padrão 10 minutos)
 */
export async function getRoomsCached<T = any>(): Promise<T[]> {
  return fetchWithDedup('rooms:all', async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('id, nome, capacidade')
      .order('nome');
    if (error) throw error;
    return (data as unknown as T[]) || [];
  }, 600_000);
}
