import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Carrega variáveis do arquivo .env
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
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
  throw new Error('Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas no .env');
}

describe('Testes Automatizados de Segurança: Supabase Auth & RLS Roles', () => {
  let anonClient;
  let testUserClient;
  let testUserId;
  let testUserEmail;
  const testPassword = 'PasswordSegura2026!';

  before(async () => {
    // Cliente anônimo puro (nunca faz login nem signUp, simulando um visitante externo deslogado)
    anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Cliente isolado apenas para disparar o cadastro do usuário de teste
    const registrationClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Cria morador de teste para os testes de privilégio
    testUserEmail = `morador_teste_sec_${Date.now()}@cantagrillo.com`;
    const { data: signUpData, error: signUpError } = await registrationClient.auth.signUp({
      email: testUserEmail,
      password: testPassword,
      options: {
        data: {
          nome: 'Morador Teste Seguranca',
          apelido: 'SecBot',
          geracao: '025',
          // TENTATIVA DE INJEÇÃO MALICIOSA NO CADASTRO
          role: 'admin',
          ativo: true,
        },
      },
    });

    if (signUpError) {
      throw new Error(`Falha ao preparar usuário de teste de segurança: ${signUpError.message}`);
    }

    testUserId = signUpData.user?.id;
    if (!testUserId) {
      throw new Error('ID do usuário de teste não foi gerado.');
    }

    // Cliente autenticado como o morador comum
    testUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInError } = await testUserClient.auth.signInWithPassword({
      email: testUserEmail,
      password: testPassword,
    });

    if (signInError) {
      throw new Error(`Falha ao autenticar cliente de teste: ${signInError.message}`);
    }
  });

  describe('1. Controle de Acesso Anônimo (Deslogado)', () => {
    it('deve proibir usuário anônimo de ler a tabela profiles', async () => {
      const { data, error } = await anonClient.from('profiles').select('*');
      // RLS deve filtrar todas as tuplas retornando 0 registros ou erro
      const count = data ? data.length : 0;
      assert.equal(count, 0, 'Usuário anônimo não pode ver nenhum perfil');
    });

    it('deve permitir usuário anônimo ler a tabela rooms (dropdown de cadastro)', async () => {
      const { data, error } = await anonClient.from('rooms').select('*');
      assert.equal(error, null, 'Leitura de rooms deve ser liberada para anônimos');
      assert.ok(data && data.length > 0, 'Quartos da casa devem estar disponíveis para seleção');
    });

    it('deve rejeitar inserção direta na tabela profiles por cliente anônimo', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000001';
      const { error } = await anonClient.from('profiles').insert({
        id: fakeUuid,
        nome: 'Hacker Anonimo',
        email: 'hacker@invasao.com',
        role: 'admin',
        ativo: true,
      });

      // Deve falhar com violação de política RLS
      assert.ok(error, 'Inserção anônima em profiles deve falhar com violação de RLS');
    });

    it('deve proibir usuário anônimo de ler a tabela daily_meals', async () => {
      const { data } = await anonClient.from('daily_meals').select('*');
      const count = data ? data.length : 0;
      assert.equal(count, 0, 'Usuário anônimo não pode ver refeições da casa');
    });

    it('deve rejeitar inserção na tabela daily_meals por cliente anônimo', async () => {
      const { error } = await anonClient.from('daily_meals').insert({
        usuario_id: '00000000-0000-0000-0000-000000000001',
        data: '2026-10-15',
        misturas_consumidas: 0.5,
      });
      assert.ok(error, 'Inserção anônima em daily_meals deve falhar por RLS');
    });
  });

  describe('2. Integridade do Gatilho do Servidor (handle_new_user)', () => {
    it('deve ignorar injeção de role=admin e ativo=true no signUp, cravando role=morador e ativo=false', async () => {
      // Consulta o perfil criado via trigger no banco usando o cliente logado
      const { data, error } = await testUserClient
        .from('profiles')
        .select('*')
        .eq('id', testUserId)
        .single();

      assert.equal(error, null, 'Usuário autenticado deve conseguir ler seu próprio perfil');
      assert.equal(data.role, 'morador', 'O servidor deve forçar role = "morador" independente do payload');
      assert.equal(data.ativo, false, 'O servidor deve forçar ativo = false aguardando aprovação');
      assert.equal(data.nome, 'Morador Teste Seguranca');
    });
  });

  describe('3. Blindagem de Privilégios por Cargo (User Roles & RLS)', () => {
    it('morador comum não deve conseguir se auto-promover para admin', async () => {
      const { error } = await testUserClient
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', testUserId);

      // Deve falhar por violação de RLS (WITH CHECK restringe role='morador' ou dispara exceção)
      assert.ok(error, 'Morador não pode alterar seu cargo para admin');
    });

    it('morador comum não deve conseguir alterar o perfil de outros moradores', async () => {
      // Tenta alterar qualquer perfil que não seja o seu
      const targetId = '00000000-0000-0000-0000-000000000002';
      const { data, error } = await testUserClient
        .from('profiles')
        .update({ nome: 'Nome Hackeado' })
        .eq('id', targetId)
        .select();

      // RLS deve retornar 0 linhas afetadas ou lançar erro
      const affected = data ? data.length : 0;
      assert.equal(affected, 0, 'Morador comum não pode modificar perfil de terceiros');
    });

    it('morador comum não deve conseguir deletar perfis da república', async () => {
      const { data, error } = await testUserClient
        .from('profiles')
        .delete()
        .eq('id', testUserId)
        .select();

      // Apenas admin tem política de DELETE em profiles
      const deletedCount = data ? data.length : 0;
      assert.equal(deletedCount, 0, 'Morador comum não tem permissão para deletar perfis');
    });

    it('morador comum deve conseguir atualizar apenas seus próprios dados cadastrais permitidos (ex: apelido)', async () => {
      const novoApelido = 'Apelido Atualizado com Sucesso';
      const { error } = await testUserClient
        .from('profiles')
        .update({ apelido: novoApelido })
        .eq('id', testUserId);

      assert.equal(error, null, 'Morador comum pode atualizar seus dados pessoais');

      // Verifica se o apelido foi realmente atualizado
      const { data } = await testUserClient
        .from('profiles')
        .select('apelido')
        .eq('id', testUserId)
        .single();

      assert.equal(data?.apelido, novoApelido);
    });

    it('morador comum não deve conseguir alterar a própria geração após cadastro (blindagem veterano/bixo)', async () => {
      const { error } = await testUserClient
        .from('profiles')
        .update({ geracao: '020' })
        .eq('id', testUserId);

      assert.notEqual(error, null, 'PostgreSQL trigger protect_profile_roles deve rejeitar alteração de geração por morador comum');
      assert.match(error?.message || '', /geração/);
    });
  });

  describe('4. Blindagem da Gestão de Frentes (front_members)', () => {
    it('morador comum não deve conseguir se auto-adicionar a uma frente ou se nomear líder', async () => {
      // Busca uma frente existente
      const { data: fronts } = await testUserClient.from('fronts').select('id').limit(1);
      const frenteId = fronts?.[0]?.id;

      if (frenteId) {
        const { error } = await testUserClient.from('front_members').insert({
          front_id: frenteId,
          profile_id: testUserId,
          is_lider: true, // Tentativa de se auto-proclamar líder
        });

        assert.ok(error, 'Morador comum não pode se inserir como membro ou líder de frente sem ser Admin');
      }
    });

    it('morador comum não deve conseguir remover ninguém de uma frente', async () => {
      const { data, error } = await testUserClient
        .from('front_members')
        .delete()
        .eq('profile_id', testUserId)
        .select();

      const deleted = data ? data.length : 0;
      assert.equal(deleted, 0, 'Morador comum não pode excluir membros de frente');
    });
  });
});
