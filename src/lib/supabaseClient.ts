import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://cacssqpwoevqaovakstk.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_-JFQeLVvhpM_4eJkqWakig_jWjpWfID';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    '[Canta Grillo PWA] As variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não foram detectadas no ambiente. Utilizando valores de conexão padrão.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
