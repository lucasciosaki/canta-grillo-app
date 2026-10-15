import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPrazo24h } from '../../src/types/pontosBagunca.ts';

describe('Unit Tests: Pontos de Bagunça & Regra de 24h com Blur', () => {
  describe('1. Cálculo de Prazo Limite de 24h (calcularPrazo24h)', () => {
    const baseNow = new Date('2026-10-15T12:00:00.000Z');

    it('deve indicar tempo restante em horas quando faltam 12h', () => {
      // Criado 12h antes de baseNow
      const createdAt = new Date('2026-10-15T00:00:00.000Z').toISOString();
      const info = calcularPrazo24h(createdAt, baseNow);

      assert.equal(info.expirado, false);
      assert.equal(info.horasRestantes, 12);
      assert.equal(info.minutosRestantes, 0);
      assert.equal(info.label, 'Resta 12h para abrir');
      assert.equal(info.porcentagemDecorrida, 50);
    });

    it('deve indicar tempo restante em minutos quando falta menos de 1h', () => {
      // Criado 23 horas e 45 minutos atrás -> faltam 15 minutos
      const createdAt = new Date(baseNow.getTime() - (23 * 60 + 45) * 60 * 1000).toISOString();
      const info = calcularPrazo24h(createdAt, baseNow);

      assert.equal(info.expirado, false);
      assert.equal(info.horasRestantes, 0);
      assert.equal(info.minutosRestantes, 15);
      assert.equal(info.label, 'Resta 15 min para abrir');
      assert.ok(info.porcentagemDecorrida > 98);
    });

    it('deve marcar expirado=true quando ultrapassar 24h', () => {
      // Criado 26h antes de baseNow -> 2h expirado
      const createdAt = new Date('2026-10-14T10:00:00.000Z').toISOString();
      const info = calcularPrazo24h(createdAt, baseNow);

      assert.equal(info.expirado, true);
      assert.equal(info.horasRestantes, 0);
      assert.equal(info.minutosRestantes, 0);
      assert.ok(info.label.includes('Prazo de 24h expirado'));
      assert.equal(info.porcentagemDecorrida, 100);
    });

    it('deve marcar expirado=true no instante exato de 24h decorridas', () => {
      const createdAt = new Date(baseNow.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const info = calcularPrazo24h(createdAt, baseNow);

      assert.equal(info.expirado, true);
      assert.equal(info.horasRestantes, 0);
      assert.equal(info.minutosRestantes, 0);
      assert.equal(info.porcentagemDecorrida, 100);
    });
  });

  describe('2. Lógica de Blur e Visualizações no Carrossel', () => {
    const pontoExemplo = {
      id: 'ponto-123',
      relator_id: 'user-relator',
      status: 'aberta',
      created_at: new Date().toISOString(),
    };

    function deveExibirBlur(ponto, userId, visualizacoesIdsSet) {
      const isRelator = ponto.relator_id === userId;
      const jaVisualizou = visualizacoesIdsSet.has(ponto.id) || isRelator;
      return !jaVisualizou;
    }

    it('morador comum que ainda não abriu deve ver o card com blur', () => {
      const visualizacoes = new Set();
      const comBlur = deveExibirBlur(pontoExemplo, 'user-outro-morador', visualizacoes);
      assert.equal(comBlur, true, 'Card deve ter blur ativo');
    });

    it('morador comum que já abriu deve ver a foto limpa sem blur', () => {
      const visualizacoes = new Set(['ponto-123']);
      const comBlur = deveExibirBlur(pontoExemplo, 'user-outro-morador', visualizacoes);
      assert.equal(comBlur, false, 'Card não deve ter blur');
    });

    it('o próprio relator que criou a denúncia nunca deve ver com blur', () => {
      const visualizacoes = new Set(); // mesmo sem registro no Set
      const comBlur = deveExibirBlur(pontoExemplo, 'user-relator', visualizacoes);
      assert.equal(comBlur, false, 'Relator nunca deve ter blur');
    });
  });

  describe('3. Regra de Resolução Antecipada (Assunção de Ponto)', () => {
    function deveAplicarPenalidadePorFaltaDeVisualizacao(ponto, moradorId, visualizacoesIdsSet, agora = new Date()) {
      // Se o culpado já assumiu antes das 24h, o ponto fecha e ninguém é penalizado
      if (ponto.status === 'assumida') {
        return false;
      }

      // O relator não é penalizado
      if (ponto.relator_id === moradorId) {
        return false;
      }

      // Se já visualizou, cumpriu a regra
      if (visualizacoesIdsSet.has(ponto.id)) {
        return false;
      }

      // Só penaliza se o prazo de 24h tiver expirado
      const info = calcularPrazo24h(ponto.created_at, agora);
      return info.expirado;
    }

    it('não deve penalizar ninguém se o ponto já foi assumido pelo culpado', () => {
      const pontoAssumido = {
        id: 'ponto-999',
        relator_id: 'user-relator',
        status: 'assumida',
        culpado_id: 'user-culpado',
        created_at: new Date('2026-10-10T12:00:00Z').toISOString(), // mais de 24h
      };

      const penalizar = deveAplicarPenalidadePorFaltaDeVisualizacao(
        pontoAssumido,
        'user-nao-abriu',
        new Set(),
        new Date('2026-10-15T12:00:00Z')
      );

      assert.equal(penalizar, false, 'Assunção do ponto anula cobrança de 24h para os demais moradores');
    });

    it('deve penalizar morador ativo que não abriu foto após 24h com ponto aberto', () => {
      const pontoAbertoVencido = {
        id: 'ponto-888',
        relator_id: 'user-relator',
        status: 'aberta',
        created_at: new Date('2026-10-14T10:00:00Z').toISOString(), // 26h atrás
      };

      const penalizar = deveAplicarPenalidadePorFaltaDeVisualizacao(
        pontoAbertoVencido,
        'user-nao-abriu',
        new Set(),
        new Date('2026-10-15T12:00:00Z')
      );

      assert.equal(penalizar, true, 'Morador que não abriu em 24h deve tomar ponto');
    });

    it('não deve penalizar morador que abriu a foto dentro do prazo', () => {
      const pontoAbertoVencido = {
        id: 'ponto-888',
        relator_id: 'user-relator',
        status: 'aberta',
        created_at: new Date('2026-10-14T10:00:00Z').toISOString(),
      };

      const penalizar = deveAplicarPenalidadePorFaltaDeVisualizacao(
        pontoAbertoVencido,
        'user-abriu',
        new Set(['ponto-888']),
        new Date('2026-10-15T12:00:00Z')
      );

      assert.equal(penalizar, false, 'Morador que abriu cumpriu o requisito');
    });
  });

  describe('4. Exibição Estrita de Apelido (Regra da República)', () => {
    function obterIdentificacaoMorador(morador) {
      if (!morador) return 'Anônimo';
      return morador.apelido || morador.nome || 'Morador';
    }

    it('deve exibir prioritariamente o apelido quando disponível', () => {
      const morador = { id: 'm1', nome: 'Rodrigo César Oliveira', apelido: 'Cachorrão' };
      assert.equal(obterIdentificacaoMorador(morador), 'Cachorrão');
    });

    it('deve fazer fallback para o nome somente se não houver apelido preenchido', () => {
      const morador = { id: 'm2', nome: 'Visitante Novo', apelido: null };
      assert.equal(obterIdentificacaoMorador(morador), 'Visitante Novo');
    });
  });
});
