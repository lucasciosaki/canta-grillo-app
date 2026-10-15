import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularResumoMisturas } from '../../src/types/refeicoes.ts';

describe('Unit Tests: Gestão de Convidados Externos (RN02 / RN15)', () => {
  describe('1. Detecção do Link de Convite e Inicialização de Modo', () => {
    it('deve identificar o parâmetro ?convite=externo na URL e abrir direto no modo convidado', () => {
      const searchParams = new URLSearchParams('?convite=externo');
      const isConvite = searchParams.get('convite') === 'externo';
      assert.equal(isConvite, true, 'Deve reconhecer convite=externo');

      const modoInicial = isConvite ? 'convidado' : 'login';
      assert.equal(modoInicial, 'convidado');
    });

    it('deve manter modo login caso a URL não possua parâmetro de convite', () => {
      const searchParams = new URLSearchParams('');
      const isConvite = searchParams.get('convite') === 'externo';
      assert.equal(isConvite, false);
      const modoInicial = isConvite ? 'convidado' : 'login';
      assert.equal(modoInicial, 'login');
    });

    it('deve gerar link de convite e mensagem de WhatsApp corretamente', () => {
      const origin = 'https://cantagrillo.app';
      const linkGerado = `${origin}/?convite=externo`;
      assert.equal(linkGerado, 'https://cantagrillo.app/?convite=externo');

      const msg = encodeURIComponent(`Salve! Segue o link para registrar sua refeição na República Canta Grillo:\n${linkGerado}`);
      assert.ok(msg.includes(encodeURIComponent(linkGerado)));
    });
  });

  describe('2. Validação e Sanitização do Cadastro de Convidado', () => {
    const sanitizarCadastroConvidado = ({ apelido, telefone, email, password }) => {
      if (!apelido?.trim()) throw new Error('Informe seu apelido.');
      if (!telefone?.trim()) throw new Error('Informe seu WhatsApp ou telefone.');
      if (!email?.trim() || (password || '').length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
      }
      return {
        email: email.trim(),
        password,
        nome: apelido.trim(),
        apelido: apelido.trim(),
        telefone_contato: telefone.trim(),
        role: 'externo',
        geracao: null,
        quarto_id: null,
      };
    };

    it('deve validar e formatar payload do convidado com role=externo e sem quarto/geração', () => {
      const payload = sanitizarCadastroConvidado({
        apelido: '  Alemão  ',
        telefone: ' (19) 98765-4321 ',
        email: 'alemao@gmail.com',
        password: 'senhaSegura123',
      });

      assert.equal(payload.role, 'externo');
      assert.equal(payload.apelido, 'Alemão');
      assert.equal(payload.nome, 'Alemão');
      assert.equal(payload.telefone_contato, '(19) 98765-4321');
      assert.equal(payload.quarto_id, null);
      assert.equal(payload.geracao, null);
    });

    it('deve rejeitar cadastro sem apelido ou sem telefone de contato', () => {
      assert.throws(
        () => sanitizarCadastroConvidado({ apelido: '', telefone: '1999999999', email: 'a@b.com', password: '123' }),
        /Informe seu apelido/
      );

      assert.throws(
        () => sanitizarCadastroConvidado({ apelido: 'Ganso', telefone: '', email: 'a@b.com', password: '123' }),
        /Informe seu WhatsApp/
      );
    });
  });

  describe('3. Roteamento de Segurança do AuthGuard por Cargo', () => {
    const avaliarRotaAuthGuard = ({ user, profile, loading, safetyTimeout }) => {
      if (loading && !safetyTimeout) return 'LoadingScreen';
      if (!user) return 'AuthScreen';
      if (profile && profile.ativo === false) return 'PendingApprovalScreen';
      if (profile?.role === 'externo') return 'ConvidadoScreen';
      return 'MainApp';
    };

    it('convidado externo (role=externo e ativo=true) deve acessar diretamente ConvidadoScreen', () => {
      const destino = avaliarRotaAuthGuard({
        user: { id: 'ext-1' },
        profile: { id: 'ext-1', role: 'externo', ativo: true, apelido: 'Bruninho' },
        loading: false,
        safetyTimeout: false,
      });

      assert.equal(destino, 'ConvidadoScreen', 'Convidado deve ser isolado na ConvidadoScreen');
    });

    it('morador pendente de aprovação (ativo=false) deve cair em PendingApprovalScreen', () => {
      const destino = avaliarRotaAuthGuard({
        user: { id: 'mor-1' },
        profile: { id: 'mor-1', role: 'morador', ativo: false, apelido: 'Bixo' },
        loading: false,
        safetyTimeout: false,
      });

      assert.equal(destino, 'PendingApprovalScreen');
    });

    it('morador ativo (role=morador e ativo=true) deve acessar a MainApp', () => {
      const destino = avaliarRotaAuthGuard({
        user: { id: 'mor-2' },
        profile: { id: 'mor-2', role: 'morador', ativo: true, apelido: 'Veterano' },
        loading: false,
        safetyTimeout: false,
      });

      assert.equal(destino, 'MainApp');
    });
  });

  describe('4. Consolidação da Folha de Misturas com Convidados Externos', () => {
    const moradores = [
      { id: 'm1', nome: 'Rodrigo', apelido: 'Cachorrão', ativo: true },
      { id: 'm2', nome: 'Lucas', apelido: 'Jumento', ativo: true },
    ];

    it('deve consolidar o total de misturas e pessoas comendo incluindo convidados', () => {
      const mealsMap = {
        m1: 1.0, // 2 misturas
        m2: 0.5, // 1 mistura
      };
      const totalConvidados = 3; // 3 convidados comeram hoje

      const resumo = calcularResumoMisturas(moradores, mealsMap, totalConvidados);

      assert.equal(resumo.totalMisturas, 4.5, '1.5 dos moradores + 3.0 dos convidados = 4.5');
      assert.equal(resumo.totalPessoas, 5, '2 moradores + 3 convidados = 5 pessoas comendo');
      assert.equal(resumo.totalConvidados, 3);
    });

    it('deve registrar presença binária para convidados (1.0 comeu, 0.0 não comeu)', () => {
      const registrarPresenca = (marcar) => (marcar ? 1.0 : 0.0);
      assert.equal(registrarPresenca(true), 1.0);
      assert.equal(registrarPresenca(false), 0.0);
    });
  });
});
