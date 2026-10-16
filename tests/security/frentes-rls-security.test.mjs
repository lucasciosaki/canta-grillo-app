import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...values] = trimmed.split('=');
      env[key.trim()] = values.join('=').trim();
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Variáveis do Supabase não encontradas. Pulando testes remotos de segurança.');
}

describe('Testes de Segurança RLS: Frentes, Chats, Funças, Dogs e Mercado', () => {
  let anonClient;

  before(() => {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  });

  describe('1. Bloqueio de Acesso Anônimo (Deslogado)', () => {
    it('usuário anônimo não deve conseguir ler mensagens de chat das frentes', async (t) => {
      if (!anonClient) return t.skip('Supabase offline');
      const { data } = await anonClient.from('mensagens_frente').select('*');
      const count = data ? data.length : 0;
      assert.equal(count, 0, 'Anônimo não pode acessar mensagens_frente');
    });

    it('usuário anônimo não deve conseguir inserir mensagens no chat da frente', async (t) => {
      if (!anonClient) return t.skip('Supabase offline');
      const { error } = await anonClient.from('mensagens_frente').insert({
        frente_id: '00000000-0000-0000-0000-000000000000',
        conteudo: 'Tentativa invasão',
      });
      assert.ok(error, 'Inserção anônima em mensagens_frente deve ser rejeitada pelo RLS');
    });

    it('usuário anônimo não deve conseguir inserir funças', async (t) => {
      if (!anonClient) return t.skip('Supabase offline');
      const { error } = await anonClient.from('funcas').insert({
        titulo: 'Invasão',
        descricao: 'Teste',
      });
      assert.ok(error, 'Inserção anônima em funcas deve ser rejeitada pelo RLS');
    });

    it('usuário anônimo não deve conseguir inserir no catálogo de mercado', async (t) => {
      if (!anonClient) return t.skip('Supabase offline');
      const { error } = await anonClient.from('market_catalog').insert({
        nome: 'Item Malicioso',
        categoria: 'Alimentos',
      });
      assert.ok(error, 'Inserção anônima em market_catalog deve ser rejeitada pelo RLS');
    });

    it('usuário anônimo não deve conseguir registrar refeição dos cães', async (t) => {
      if (!anonClient) return t.skip('Supabase offline');
      const { error } = await anonClient.from('dogs_refeicoes_diarias').insert({
        turno: 'manha',
      });
      assert.ok(error, 'Inserção anônima em dogs_refeicoes_diarias deve ser rejeitada pelo RLS');
    });
  });
});
