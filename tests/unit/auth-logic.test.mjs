import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Funções de decisão de segurança replicando a lógica de negócio do AuthGuard e AuthContext
 */
export function evaluateAccessGuard({ user, profile, loading, safetyTimeout }) {
  if (loading && !safetyTimeout) {
    return 'LOADING_SCREEN';
  }
  if (!user) {
    return 'AUTH_SCREEN';
  }
  if (profile && profile.ativo === false) {
    return 'PENDING_APPROVAL_SCREEN';
  }
  return 'APP_ACCESS_GRANTED';
}

export function canAccessAdminFeatures(profile) {
  return !!profile && profile.ativo === true && profile.role === 'admin';
}

export function canPublishAta(profile) {
  // Conforme RN12: qualquer morador ativo pode publicar atas
  return !!profile && profile.ativo === true;
}

export function validateSignUpPayload({ nome, email, password, geracao, quartoId }) {
  if (!nome || !nome.trim()) {
    throw new Error('Informe seu nome completo.');
  }
  if (!email || !email.trim()) {
    throw new Error('Informe um e-mail válido.');
  }
  if (!password || password.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }
  return {
    nome: nome.trim(),
    email: email.trim(),
    geracao: geracao?.trim() || '025',
    quarto_id: quartoId || null,
    role: 'morador',
  };
}

describe('Unit Tests: Regras de Segurança no Front-end (AuthGuard & Roles)', () => {
  describe('Matriz de Decisão do AuthGuard', () => {
    it('deve exibir LoadingScreen enquanto a sessão carrega e o timeout não expirou', () => {
      const state = evaluateAccessGuard({
        user: null,
        profile: null,
        loading: true,
        safetyTimeout: false,
      });
      assert.equal(state, 'LOADING_SCREEN');
    });

    it('deve exibir AuthScreen se o usuário não estiver autenticado (deslogado)', () => {
      const state = evaluateAccessGuard({
        user: null,
        profile: null,
        loading: false,
        safetyTimeout: false,
      });
      assert.equal(state, 'AUTH_SCREEN');
    });

    it('deve bloquear morador com ativo=false e direcionar para PendingApprovalScreen', () => {
      const state = evaluateAccessGuard({
        user: { id: 'usr-123', email: 'morador@rep.com' },
        profile: { id: 'usr-123', nome: 'Bixo 026', role: 'morador', ativo: false },
        loading: false,
        safetyTimeout: true,
      });
      assert.equal(state, 'PENDING_APPROVAL_SCREEN');
    });

    it('deve liberar acesso à Home se o morador for autenticado e ativo=true', () => {
      const state = evaluateAccessGuard({
        user: { id: 'usr-456', email: 'veterano@rep.com' },
        profile: { id: 'usr-456', nome: 'Veterano 023', role: 'morador', ativo: true },
        loading: false,
        safetyTimeout: true,
      });
      assert.equal(state, 'APP_ACCESS_GRANTED');
    });
  });

  describe('Verificação de Privilégios por Cargo (User Roles)', () => {
    it('morador comum ativo não pode acessar funções exclusivas de Admin', () => {
      const moradorAtivo = { id: 'm1', role: 'morador', ativo: true };
      assert.equal(canAccessAdminFeatures(moradorAtivo), false);
    });

    it('admin inativo (ativo=false) não pode acessar funções de Admin', () => {
      const adminInativo = { id: 'a1', role: 'admin', ativo: false };
      assert.equal(canAccessAdminFeatures(adminInativo), false);
    });

    it('apenas admin com ativo=true tem acesso liberado às funções de Admin', () => {
      const adminValido = { id: 'adm-boss', role: 'admin', ativo: true };
      assert.equal(canAccessAdminFeatures(adminValido), true);
    });

    it('qualquer morador ativo pode publicar atas de reunião (RN12)', () => {
      const moradorComum = { id: 'm2', role: 'morador', ativo: true };
      assert.equal(canPublishAta(moradorComum), true);
    });

    it('morador pendente (ativo=false) não pode publicar atas', () => {
      const moradorPendente = { id: 'm3', role: 'morador', ativo: false };
      assert.equal(canPublishAta(moradorPendente), false);
    });
  });

  describe('Sanitização e Validação do Formulário de Cadastro', () => {
    it('deve sanitizar strings e cravá-las com role=morador', () => {
      const payload = validateSignUpPayload({
        nome: '  Carlos Morador  ',
        email: '  carlos@rep.com  ',
        password: 'password123',
        geracao: ' 025 ',
        quartoId: 'room-uuid',
      });
      assert.equal(payload.nome, 'Carlos Morador');
      assert.equal(payload.email, 'carlos@rep.com');
      assert.equal(payload.geracao, '025');
      assert.equal(payload.role, 'morador');
      assert.equal(payload.quarto_id, 'room-uuid');
    });

    it('deve rejeitar cadastro sem nome ou com senha menor que 6 caracteres', () => {
      assert.throws(() => validateSignUpPayload({ nome: '', email: 'a@b.com', password: '123' }), /nome completo/);
      assert.throws(() => validateSignUpPayload({ nome: 'Ana', email: 'a@b.com', password: '123' }), /6 caracteres/);
    });
  });
});
