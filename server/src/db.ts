import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega o .env da raiz do projeto
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
export const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const hasServiceRole = Boolean(serviceRoleKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Backend] Atenção: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configuradas.');
}
if (!hasServiceRole) {
  console.warn(
    '[Backend] SUPABASE_SERVICE_ROLE_KEY ausente: as rotinas agendadas (01h/11h) rodarão sem privilégios e ' +
      'serão bloqueadas pelo RLS. Requisições de usuários usam o token do próprio usuário.'
  );
}

const authOptions = { persistSession: false, autoRefreshToken: false };

/** Cliente de sistema (cron): usa a service role se disponível. */
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey, {
  auth: authOptions,
});

/** Cria um cliente que age em nome do usuário (RLS aplica auth.uid() do token). */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const requestClient = new AsyncLocalStorage<SupabaseClient>();

/** Executa `fn` com o cliente do usuário da requisição atual. */
export function runWithClient<T>(client: SupabaseClient, fn: () => T): T {
  return requestClient.run(client, fn);
}

/** Cliente ativo: o do usuário da requisição (se houver) ou o de sistema. */
export function db(): SupabaseClient {
  return requestClient.getStore() ?? supabaseAdmin;
}
