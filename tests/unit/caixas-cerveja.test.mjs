import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  obterApelidoMorador,
  calcularResumoCaixas,
  agruparCaixasPorMorador,
  obterHistoricoCaixasPagas,
  obterCaixasComSolicitacao,
  podeExecutarTransicaoCaixa,
  validarLancamentoManual,
} from '../../src/types/cervejas.ts';

describe('Unit Tests: Caixas de Cerveja (RN07)', () => {
  describe('1. Identificação Estrita por Apelido (obterApelidoMorador)', () => {
    it('deve priorizar o apelido quando disponível', () => {
      const morador = { id: 'm1', nome: 'Rodrigo César Oliveira', apelido: 'Cachorrão' };
      assert.equal(obterApelidoMorador(morador), 'Cachorrão');
    });

    it('deve fazer fallback para o nome apenas se apelido for nulo ou vazio', () => {
      const moradorSemApelido = { id: 'm2', nome: 'Gabriel Silva', apelido: null };
      assert.equal(obterApelidoMorador(moradorSemApelido), 'Gabriel Silva');

      const moradorApelidoVazio = { id: 'm3', nome: 'Gabriel Silva', apelido: '   ' };
      assert.equal(obterApelidoMorador(moradorApelidoVazio), 'Gabriel Silva');
    });

    it('deve retornar "Morador" caso o objeto seja nulo ou indefinido', () => {
      assert.equal(obterApelidoMorador(null), 'Morador');
      assert.equal(obterApelidoMorador(undefined), 'Morador');
    });
  });

  describe('2. Agrupamento e Ordenação por Morador (agruparCaixasPorMorador)', () => {
    const moradores = [
      { id: 'user-ganso', nome: 'Leonardo Ganso', apelido: 'Ganso', geracao: '024' },
      { id: 'user-bixo', nome: 'Marcos Bixo', apelido: 'Bixo 026', geracao: '026' },
      { id: 'user-cachorrao', nome: 'Rodrigo Cachorrão', apelido: 'Cachorrão', geracao: '025' },
      { id: 'user-em-dia', nome: 'Lucas Limpo', apelido: 'Azeitona', geracao: '025' },
    ];

    const caixas = [
      {
        id: 'c1',
        morador_id: 'user-ganso',
        motivo_descricao: 'Passou no estágio da Embraer',
        origem: 'manual',
        data_atribuicao: '2026-10-01',
        status: 'pendente',
        solicitada_em: null,
        baixada_em: null,
        baixada_por: null,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'c2',
        morador_id: 'user-cachorrao',
        motivo_descricao: 'Começou a namorar',
        origem: 'manual',
        data_atribuicao: '2026-10-05',
        status: 'baixa_solicitada',
        solicitada_em: '2026-10-15T18:00:00Z',
        baixada_em: null,
        baixada_por: null,
        created_at: '2026-10-05T12:00:00Z',
      },
      {
        id: 'c3',
        morador_id: 'user-bixo',
        motivo_descricao: 'Acúmulo de 7 pontos de bagunça em 10/2026',
        origem: 'pontos',
        data_atribuicao: '2026-10-10',
        status: 'pendente',
        solicitada_em: null,
        baixada_em: null,
        baixada_por: null,
        created_at: '2026-10-10T14:00:00Z',
      },
      {
        id: 'c4',
        morador_id: 'user-bixo',
        motivo_descricao: 'Prenda da Reunião Geral',
        origem: 'manual',
        data_atribuicao: '2026-10-12',
        status: 'pendente',
        solicitada_em: null,
        baixada_em: null,
        baixada_por: null,
        created_at: '2026-10-12T20:00:00Z',
      },
      {
        id: 'c5',
        morador_id: 'user-ganso',
        motivo_descricao: 'Aniversário na rep',
        origem: 'manual',
        data_atribuicao: '2026-09-01',
        status: 'paga',
        solicitada_em: null,
        baixada_em: '2026-09-05T15:00:00Z',
        baixada_por: 'user-admin',
        created_at: '2026-09-01T10:00:00Z',
      },
    ];

    it('deve listar todos os moradores ativos (incluindo quem tem 0 caixas pendentes)', () => {
      const agrupados = agruparCaixasPorMorador(moradores, caixas);
      assert.equal(agrupados.length, 4);
      const azeitona = agrupados.find((m) => m.morador.id === 'user-em-dia');
      assert.ok(azeitona);
      assert.equal(azeitona.pendentesCount, 0);
      assert.equal(azeitona.resumoMotivosPendentes, '');
    });

    it('deve posicionar devedores com maior número de caixas no topo', () => {
      const agrupados = agruparCaixasPorMorador(moradores, caixas);
      // user-bixo tem 2 pendentes
      assert.equal(agrupados[0].morador.id, 'user-bixo');
      assert.equal(agrupados[0].pendentesCount, 2);
    });

    it('em caso de empate em pendentes, deve priorizar morador com baixa_solicitada', () => {
      const agrupados = agruparCaixasPorMorador(moradores, caixas);
      // user-cachorrao tem 1 (baixa_solicitada) vs user-ganso tem 1 (pendente)
      assert.equal(agrupados[1].morador.id, 'user-cachorrao');
      assert.equal(agrupados[1].baixaSolicitadaCount, 1);
      assert.equal(agrupados[2].morador.id, 'user-ganso');
    });

    it('deve gerar resumoMotivosPendentes concatenado para leitura imediata', () => {
      const agrupados = agruparCaixasPorMorador(moradores, caixas);
      const bixo = agrupados.find((m) => m.morador.id === 'user-bixo');
      assert.ok(bixo.resumoMotivosPendentes.includes('7 pontos'));
      assert.ok(bixo.resumoMotivosPendentes.includes('Prenda da Reunião'));
    });

    it('deve excluir estritamente agregados (role === "externo") da lista de moradores e caixas', () => {
      const moradoresComExterno = [
        { id: 'user-morador', nome: 'Morador Interno', apelido: 'Bicho', role: 'morador' },
        { id: 'user-agregado', nome: 'Amigo de Fora', apelido: 'Agregado', role: 'externo' },
      ];
      const caixasComExterno = [
        {
          id: 'c-ext',
          morador_id: 'user-agregado',
          motivo_descricao: 'Almoço avulso',
          origem: 'manual',
          status: 'pendente',
          morador: { id: 'user-agregado', nome: 'Amigo de Fora', apelido: 'Agregado', role: 'externo' },
          created_at: '2026-10-01T10:00:00Z',
        },
      ];

      const agrupados = agruparCaixasPorMorador(moradoresComExterno, caixasComExterno);
      assert.equal(agrupados.length, 1);
      assert.equal(agrupados[0].morador.id, 'user-morador');
      assert.equal(agrupados.some((m) => m.morador.id === 'user-agregado'), false);
    });

    it('deve separar corretamente caixasEmAberto e caixasPagas', () => {
      const agrupados = agruparCaixasPorMorador(moradores, caixas);
      const ganso = agrupados.find((m) => m.morador.id === 'user-ganso');
      assert.equal(ganso.caixasEmAberto.length, 1);
      assert.equal(ganso.caixasPagas.length, 1);
      assert.equal(ganso.caixasPagas[0].status, 'paga');
    });
  });

  describe('3. Cálculo de Resumo Global (calcularResumoCaixas)', () => {
    const caixas = [
      { id: '1', morador_id: 'u1', status: 'pendente' },
      { id: '2', morador_id: 'u1', status: 'baixa_solicitada' },
      { id: '3', morador_id: 'u2', status: 'pendente' },
      { id: '4', morador_id: 'u3', status: 'paga' },
      { id: '5', morador_id: 'u1', status: 'paga' },
    ];

    it('deve totalizar caixas pendentes da casa, aguardando confirmação e histórico', () => {
      const resumo = calcularResumoCaixas(caixas, 'u1');

      assert.equal(resumo.totalPendentesCasa, 3); // id 1, 2, 3
      assert.equal(resumo.aguardandoConfirmacao, 1); // id 2
      assert.equal(resumo.moradoresDevedoresCount, 2); // u1 e u2
      assert.equal(resumo.minhasPendentes, 2); // u1 tem id 1 e 2
      assert.equal(resumo.totalPagasHistorico, 2); // id 4 e 5
    });
  });

  describe('4. Histórico Geral de Caixas Pagas (obterHistoricoCaixasPagas)', () => {
    it('deve filtrar apenas caixas com status paga ordenadas por baixada_em decrescente', () => {
      const caixas = [
        { id: '1', status: 'pendente', created_at: '2026-10-01T00:00:00Z' },
        { id: '2', status: 'paga', baixada_em: '2026-10-10T12:00:00Z', created_at: '2026-10-02T00:00:00Z' },
        { id: '3', status: 'paga', baixada_em: '2026-10-15T12:00:00Z', created_at: '2026-10-03T00:00:00Z' },
      ];

      const pagas = obterHistoricoCaixasPagas(caixas);
      assert.equal(pagas.length, 2);
      assert.equal(pagas[0].id, '3'); // mais recente em baixada_em
      assert.equal(pagas[1].id, '2');
    });
  });

  describe('5. Regras de Transição de Status e Permissões (podeExecutarTransicaoCaixa)', () => {
    const caixaMorador1 = { morador_id: 'user-1', status: 'pendente' };
    const caixaSolicitada1 = { morador_id: 'user-1', status: 'baixa_solicitada' };
    const caixaPaga1 = { morador_id: 'user-1', status: 'paga' };

    it('morador comum devedor pode solicitar baixa da própria caixa pendente', () => {
      const permitido = podeExecutarTransicaoCaixa({
        caixa: caixaMorador1,
        novoStatus: 'baixa_solicitada',
        userId: 'user-1',
        isAdmin: false,
      });
      assert.equal(permitido, true);
    });

    it('morador comum não pode solicitar baixa de caixa de outro morador', () => {
      const permitido = podeExecutarTransicaoCaixa({
        caixa: caixaMorador1,
        novoStatus: 'baixa_solicitada',
        userId: 'user-hacker',
        isAdmin: false,
      });
      assert.equal(permitido, false);
    });

    it('morador comum não pode dar baixa final direta (paga)', () => {
      const permitido = podeExecutarTransicaoCaixa({
        caixa: caixaMorador1,
        novoStatus: 'paga',
        userId: 'user-1',
        isAdmin: false,
      });
      assert.equal(permitido, false);
    });

    it('administrador pode aprovar baixa de caixa com baixa_solicitada', () => {
      const permitido = podeExecutarTransicaoCaixa({
        caixa: caixaSolicitada1,
        novoStatus: 'paga',
        userId: 'admin-user',
        isAdmin: true,
      });
      assert.equal(permitido, true);
    });

    it('administrador pode dar baixa direta de caixa pendente', () => {
      const permitido = podeExecutarTransicaoCaixa({
        caixa: caixaMorador1,
        novoStatus: 'paga',
        userId: 'admin-user',
        isAdmin: true,
      });
      assert.equal(permitido, true);
    });

    it('administrador pode recusar solicitação de baixa retornando para pendente', () => {
      const permitido = podeExecutarTransicaoCaixa({
        caixa: caixaSolicitada1,
        novoStatus: 'pendente',
        userId: 'admin-user',
        isAdmin: true,
      });
      assert.equal(permitido, true);
    });

    it('não permite transições inválidas em caixas já pagas', () => {
      const permitidoMorador = podeExecutarTransicaoCaixa({
        caixa: caixaPaga1,
        novoStatus: 'pendente',
        userId: 'user-1',
        isAdmin: false,
      });
      assert.equal(permitidoMorador, false);

      const permitidoAdmin = podeExecutarTransicaoCaixa({
        caixa: caixaPaga1,
        novoStatus: 'baixa_solicitada',
        userId: 'admin-user',
        isAdmin: true,
      });
      assert.equal(permitidoAdmin, false);
    });
  });

  describe('6. Validação de Lançamento Manual Unitário (validarLancamentoManual)', () => {
    it('deve rejeitar tentativa de lançamento por usuário não-administrador', () => {
      const res = validarLancamentoManual({
        morador_id: 'user-1',
        motivo_descricao: 'Passou no estágio',
        isAdmin: false,
      });
      assert.equal(res.valido, false);
      assert.ok(res.erro.includes('administradores'));
    });

    it('deve rejeitar se morador_id não for informado', () => {
      const res = validarLancamentoManual({
        morador_id: '   ',
        motivo_descricao: 'Passou no estágio',
        isAdmin: true,
      });
      assert.equal(res.valido, false);
      assert.ok(res.erro.includes('morador'));
    });

    it('deve rejeitar motivo muito curto ou vazio', () => {
      const res = validarLancamentoManual({
        morador_id: 'user-1',
        motivo_descricao: 'Oi',
        isAdmin: true,
      });
      assert.equal(res.valido, false);
      assert.ok(res.erro.includes('motivo'));
    });

    it('deve aprovar lançamento manual válido por administrador', () => {
      const res = validarLancamentoManual({
        morador_id: 'user-1',
        motivo_descricao: 'Passou no estágio da Embraer',
        isAdmin: true,
      });
      assert.equal(res.valido, true);
      assert.equal(res.erro, undefined);
    });
  });

  describe('7. Listagem de Solicitações de Baixa (obterCaixasComSolicitacao)', () => {
    const caixas = [
      {
        id: 'c1',
        morador_id: 'user-morador-1',
        status: 'baixa_solicitada',
        solicitada_em: '2026-10-15T10:00:00Z',
        morador: { id: 'user-morador-1', nome: 'Morador 1', apelido: 'M1', role: 'morador' },
      },
      {
        id: 'c2',
        morador_id: 'user-morador-2',
        status: 'baixa_solicitada',
        solicitada_em: '2026-10-16T08:00:00Z',
        morador: { id: 'user-morador-2', nome: 'Morador 2', apelido: 'M2', role: 'morador' },
      },
      {
        id: 'c3',
        morador_id: 'user-morador-3',
        status: 'pendente',
        solicitada_em: null,
        morador: { id: 'user-morador-3', nome: 'Morador 3', apelido: 'M3', role: 'morador' },
      },
      {
        id: 'c4',
        morador_id: 'user-morador-4',
        status: 'paga',
        solicitada_em: '2026-10-14T08:00:00Z',
        baixada_em: '2026-10-14T09:00:00Z',
        morador: { id: 'user-morador-4', nome: 'Morador 4', apelido: 'M4', role: 'morador' },
      },
      {
        id: 'c-ext',
        morador_id: 'user-ext',
        status: 'baixa_solicitada',
        solicitada_em: '2026-10-16T09:00:00Z',
        morador: { id: 'user-ext', nome: 'Externo', apelido: 'Ext', role: 'externo' },
      },
    ];

    it('deve retornar apenas caixas com status baixa_solicitada', () => {
      const solicitacoes = obterCaixasComSolicitacao(caixas);
      assert.equal(solicitacoes.every((c) => c.status === 'baixa_solicitada'), true);
    });

    it('deve excluir solicitações de usuários externos (agregados)', () => {
      const solicitacoes = obterCaixasComSolicitacao(caixas);
      assert.equal(solicitacoes.some((c) => c.id === 'c-ext'), false);
    });

    it('deve ordenar por solicitada_em decrescente (mais recente primeiro)', () => {
      const solicitacoes = obterCaixasComSolicitacao(caixas);
      assert.equal(solicitacoes.length, 2);
      assert.equal(solicitacoes[0].id, 'c2'); // 2026-10-16
      assert.equal(solicitacoes[1].id, 'c1'); // 2026-10-15
    });

    it('deve retornar lista vazia caso não haja caixas com baixa_solicitada', () => {
      const caixasSemSolicitacao = [
        { id: '1', status: 'pendente' },
        { id: '2', status: 'paga' },
      ];
      const solicitacoes = obterCaixasComSolicitacao(caixasSemSolicitacao);
      assert.deepEqual(solicitacoes, []);
    });
  });
});
