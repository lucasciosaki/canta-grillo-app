import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNCOES_OFICIAIS,
  calcularProximaRotacao,
  atingiuPenalidadeSemanal,
  getIsoWeekAndYear,
  getDiasDaSemanaIso,
  REGRAS_PONTOS_PADRAO,
  obterRegraPorPontos,
} from '../../src/types/faxina.ts';

describe('Unit Tests: Quadro de Pontos & Rodízio Linear de Faxina', () => {
  describe('1. Catálogo Fixo das 6 Funções Oficiais', () => {
    it('deve possuir exatamente 6 funções fixas na ordem acordada', () => {
      assert.equal(FUNCOES_OFICIAIS.length, 6);
      assert.deepEqual([...FUNCOES_OFICIAIS], [
        'Sala de TV',
        'Sala de Estudos',
        'Externo',
        'Dispensa',
        'Cozinha',
        'Halls',
      ]);
    });

    it('Halls deve ser a 6ª função (índice 5), com papel de Fiscal', () => {
      assert.equal(FUNCOES_OFICIAIS[5], 'Halls');
    });
  });

  describe('2. Rodízio Linear Circular entre os 6 Quartos', () => {
    const quartos = [
      { quarto_id: 'q1', area_ordem: 0 }, // Sala de TV
      { quarto_id: 'q2', area_ordem: 1 }, // Sala de Estudos
      { quarto_id: 'q3', area_ordem: 2 }, // Externo
      { quarto_id: 'q4', area_ordem: 3 }, // Dispensa
      { quarto_id: 'q5', area_ordem: 4 }, // Cozinha
      { quarto_id: 'q6', area_ordem: 5 }, // Halls (Fiscal)
    ];

    it('cada quarto deve avançar linearmente 1 posição na lista de funções', () => {
      const proximaSemana = calcularProximaRotacao(quartos);

      assert.equal(proximaSemana[0].proxima_area_ordem, 1, 'q1 (Sala de TV -> Sala de Estudos)');
      assert.equal(proximaSemana[1].proxima_area_ordem, 2, 'q2 (Sala de Estudos -> Externo)');
      assert.equal(proximaSemana[2].proxima_area_ordem, 3, 'q3 (Externo -> Dispensa)');
      assert.equal(proximaSemana[3].proxima_area_ordem, 4, 'q4 (Dispensa -> Cozinha)');
      assert.equal(proximaSemana[4].proxima_area_ordem, 5, 'q5 (Cozinha -> Halls/Fiscal)');
      assert.equal(proximaSemana[5].proxima_area_ordem, 0, 'q6 (Halls -> Sala de TV, fechando o ciclo)');
    });

    it('deve garantir bijeção completa sem colisões (6 quartos únicos em 6 funções únicas)', () => {
      const proximaSemana = calcularProximaRotacao(quartos);
      const funcoesUsadas = new Set(proximaSemana.map((p) => p.proxima_area_ordem));

      assert.equal(funcoesUsadas.size, 6, 'Todas as 6 funções devem estar ocupadas');
      for (let i = 0; i < 6; i++) {
        assert.ok(funcoesUsadas.has(i), `Função de índice ${i} deve ter 1 quarto atribuído`);
      }
    });

    it('após 6 rotações consecutivas, cada quarto deve retornar à sua função original', () => {
      let estado = quartos;
      for (let ciclo = 1; ciclo <= 6; ciclo++) {
        const proximo = calcularProximaRotacao(estado);
        estado = proximo.map((p) => ({ quarto_id: p.quarto_id, area_ordem: p.proxima_area_ordem }));
      }
      assert.deepEqual(estado, quartos, 'Ciclo de 6 semanas fecha uma revolução completa');
    });
  });

  describe('3. Regras de Penalidades Configuráveis (2 a 7 Faltas)', () => {
    it('0 e 1 falta não devem acionar penalidade', () => {
      assert.equal(atingiuPenalidadeSemanal(0), false);
      assert.equal(atingiuPenalidadeSemanal(1), false);
      assert.equal(obterRegraPorPontos(0), null);
      assert.equal(obterRegraPorPontos(1), null);
    });

    it('deve retornar a penalidade específica para cada nível de 2 a 7 faltas', () => {
      assert.equal(atingiuPenalidadeSemanal(2), true);
      assert.equal(obterRegraPorPontos(2)?.pontos, 2);
      assert.equal(obterRegraPorPontos(2)?.descricao, 'Pagar 1 caixa de cerveja para a casa');

      assert.equal(obterRegraPorPontos(3)?.pontos, 3);
      assert.equal(obterRegraPorPontos(3)?.descricao, 'Pagar 2 caixas de cerveja para a casa');

      assert.equal(obterRegraPorPontos(4)?.pontos, 4);
      assert.equal(obterRegraPorPontos(4)?.descricao, 'Lavar a cozinha no domingo + 2 caixas');

      assert.equal(obterRegraPorPontos(5)?.pontos, 5);
      assert.equal(obterRegraPorPontos(5)?.descricao, 'Faxina geral da área externa + 3 caixas');

      assert.equal(obterRegraPorPontos(6)?.pontos, 6);
      assert.equal(obterRegraPorPontos(6)?.descricao, 'Faxina pesada da república inteira');

      assert.equal(obterRegraPorPontos(7)?.pontos, 7);
      assert.equal(obterRegraPorPontos(7)?.descricao, 'Pena máxima: Churrasco por conta do quarto');
    });

    it('mais de 7 faltas deve manter a penalidade máxima (nível 7)', () => {
      assert.equal(obterRegraPorPontos(8)?.pontos, 7);
      assert.equal(obterRegraPorPontos(10)?.pontos, 7);
    });

    it('deve permitir regras customizadas configuradas pelo administrador', () => {
      const regrasCustom = [
        { pontos: 2, descricao: 'Lavar louça por 3 dias' },
        { pontos: 3, descricao: 'Comprar 1 engradado de refrigerante' },
        { pontos: 4, descricao: 'Comprar 2 fardos de cerveja' },
        { pontos: 5, descricao: 'Fazer o almoço de sábado' },
        { pontos: 6, descricao: 'Pintar o muro da república' },
        { pontos: 7, descricao: 'Churrasco com chopp pago pelo quarto' },
      ];

      assert.equal(obterRegraPorPontos(2, regrasCustom)?.descricao, 'Lavar louça por 3 dias');
      assert.equal(obterRegraPorPontos(5, regrasCustom)?.descricao, 'Fazer o almoço de sábado');
      assert.equal(obterRegraPorPontos(7, regrasCustom)?.descricao, 'Churrasco com chopp pago pelo quarto');
    });
  });

  describe('4. Regra de Negócio: Corte Diário da 01:00 BRT', () => {
    function processarCorteDiario(tarefasHoje) {
      const quartosPenalizados = [];
      for (const t of tarefasHoje) {
        // Se não enviou foto ou marcou como faltou, toma ponto
        if (!t.fotos_comprovacao || t.fotos_comprovacao.length === 0 || t.status !== 'cumprido') {
          quartosPenalizados.push(t.quarto_id);
        }
      }
      return quartosPenalizados;
    }

    it('deve identificar e penalizar quartos que não postaram foto da faxina até 01:00', () => {
      const mockTarefas = [
        { quarto_id: 'q1', status: 'cumprido', fotos_comprovacao: ['https://storage/foto1.jpg'] },
        { quarto_id: 'q2', status: 'pendente', fotos_comprovacao: [] }, // NÃO enviou foto
        { quarto_id: 'q3', status: 'cumprido', fotos_comprovacao: ['https://storage/foto3.jpg'] },
        { quarto_id: 'q4', status: 'pendente', fotos_comprovacao: [] }, // NÃO enviou foto
        { quarto_id: 'q5', status: 'cumprido', fotos_comprovacao: ['https://storage/foto5.jpg'] },
        { quarto_id: 'q6', status: 'cumprido', fotos_comprovacao: ['https://storage/foto6.jpg'] }, // Halls enviou sua foto
      ];

      const faltas = processarCorteDiario(mockTarefas);
      assert.deepEqual(faltas, ['q2', 'q4'], 'Apenas q2 e q4 devem tomar ponto às 01:00');
    });

    it('não deve penalizar nenhum quarto se todos enviaram as fotos', () => {
      const mockTarefas = [
        { quarto_id: 'q1', status: 'cumprido', fotos_comprovacao: ['https://storage/foto.jpg'] },
        { quarto_id: 'q2', status: 'cumprido', fotos_comprovacao: ['https://storage/foto.jpg'] },
        { quarto_id: 'q3', status: 'cumprido', fotos_comprovacao: ['https://storage/foto.jpg'] },
        { quarto_id: 'q4', status: 'cumprido', fotos_comprovacao: ['https://storage/foto.jpg'] },
        { quarto_id: 'q5', status: 'cumprido', fotos_comprovacao: ['https://storage/foto.jpg'] },
        { quarto_id: 'q6', status: 'cumprido', fotos_comprovacao: ['https://storage/foto.jpg'] },
      ];

      const faltas = processarCorteDiario(mockTarefas);
      assert.equal(faltas.length, 0);
    });
  });

  describe('5. Regra de Negócio: Fiscalização do Halls & Auditoria das 11:00 BRT', () => {
    function auditoriaFiscal11h(quartoFiscalId, tarefasOntem) {
      const resultado = {
        hallsPenalizado: false,
        totalOmissoes: 0,
      };

      // Fiscal analisa apenas as outras 5 funções (excluindo a sua própria)
      const outrasFuncoes = tarefasOntem.filter((t) => t.quarto_id !== quartoFiscalId);
      const tarefaHalls = tarefasOntem.find((t) => t.quarto_id === quartoFiscalId);

      for (const t of outrasFuncoes) {
        // Se a tarefa foi feita pelo quarto mas o fiscal não avaliou até de manhã:
        if (t.status === 'cumprido' && t.fiscal_status === 'pendente') {
          resultado.totalOmissoes += 1;
        }
      }

      // Regra acordada da Canta Grillo:
      // 1. Halls toma no máximo 1 ponto por omissão no dia (mesmo que haja múltiplas omissões)
      // 2. Se o halls já tomou ponto por não tirar a foto do hall (status = 'faltou'), NÃO toma outro ponto no dia!
      const hallsJaTinhaFaltaPorFoto = tarefaHalls?.status === 'faltou';
      if (resultado.totalOmissoes > 0 && !hallsJaTinhaFaltaPorFoto) {
        resultado.hallsPenalizado = true;
      }

      return resultado;
    }

    it('deve penalizar o quarto do Halls com no máximo 1 ponto por omissão se ele enviou a foto do hall mas deixou tarefas sem fiscalizar', () => {
      const quartoFiscalId = 'q6'; // Halls
      const tarefasOntem = [
        { quarto_id: 'q1', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q2', status: 'cumprido', fiscal_status: 'pendente' }, // Omissão 1
        { quarto_id: 'q3', status: 'cumprido', fiscal_status: 'pendente' }, // Omissão 2
        { quarto_id: 'q4', status: 'faltou', fiscal_status: 'pendente' },
        { quarto_id: 'q5', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q6', status: 'cumprido', fiscal_status: 'aprovado' }, // Halls tirou a foto do Hall
      ];

      const audit = auditoriaFiscal11h(quartoFiscalId, tarefasOntem);
      assert.equal(audit.hallsPenalizado, true, 'Halls deve ser penalizado por omissão');
      assert.equal(audit.totalOmissoes, 2, '2 tarefas ficaram sem check, mas Halls toma no máximo 1 falta');
    });

    it('NÃO deve aplicar novo ponto ao Halls por omissão caso ele já tenha tomado ponto por falta de foto do hall', () => {
      const quartoFiscalId = 'q6'; // Halls
      const tarefasOntem = [
        { quarto_id: 'q1', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q2', status: 'cumprido', fiscal_status: 'pendente' }, // Omitiu check
        { quarto_id: 'q3', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q4', status: 'faltou', fiscal_status: 'pendente' },
        { quarto_id: 'q5', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q6', status: 'faltou', fiscal_status: 'pendente' }, // Halls já tomou falta às 01h por não tirar foto
      ];

      const audit = auditoriaFiscal11h(quartoFiscalId, tarefasOntem);
      assert.equal(audit.totalOmissoes, 1, 'Houve 1 omissão');
      assert.equal(audit.hallsPenalizado, false, 'Como já tomou ponto por não tirar foto do hall, não toma outro no dia');
    });

    it('não deve penalizar o Halls se ele avaliou todas as tarefas cumpridas', () => {
      const quartoFiscalId = 'q6';
      const tarefasOntem = [
        { quarto_id: 'q1', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q2', status: 'cumprido', fiscal_status: 'reprovado' },
        { quarto_id: 'q3', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q4', status: 'faltou', fiscal_status: 'pendente' },
        { quarto_id: 'q5', status: 'cumprido', fiscal_status: 'aprovado' },
        { quarto_id: 'q6', status: 'cumprido', fiscal_status: 'aprovado' },
      ];

      const audit = auditoriaFiscal11h(quartoFiscalId, tarefasOntem);
      assert.equal(audit.hallsPenalizado, false);
      assert.equal(audit.totalOmissoes, 0);
    });

    it('reprovação expressa pelo fiscal deve aplicar ponto ao quarto avaliado', () => {
      function aplicarDecisaoFiscal(tarefa, decisao) {
        if (decisao.status === 'reprovado') {
          return { quartoPenalizado: tarefa.quarto_id, motivo: decisao.observacao };
        }
        return { quartoPenalizado: null };
      }

      const res = aplicarDecisaoFiscal(
        { quarto_id: 'q2', area_nome: 'Sala de Estudos' },
        { status: 'reprovado', observacao: 'Mesas cheias de folhas e pó' }
      );

      assert.equal(res.quartoPenalizado, 'q2');
      assert.equal(res.motivo, 'Mesas cheias de folhas e pó');
    });
  });

  describe('6. Cálculo de Semana ISO, Ano e 7 Dias da Semana', () => {
    it('deve retornar semana e ano válidos para datas correntes', () => {
      const info = getIsoWeekAndYear(new Date('2026-10-15T12:00:00Z'));
      assert.ok(info.semana_ano >= 1 && info.semana_ano <= 53);
      assert.equal(info.ano, 2026);
    });

    it('deve gerar exatamente os 7 dias da semana ISO (Seg a Dom) consistentes com getIsoWeekAndYear', () => {
      const { semana_ano, ano } = getIsoWeekAndYear(new Date('2026-10-27T12:00:00Z'));
      const dias = getDiasDaSemanaIso(semana_ano, ano);

      assert.equal(dias.length, 7);
      assert.deepEqual(
        dias.map((d) => d.sigla),
        ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
      );

      for (const dia of dias) {
        const [yyyy, mm, dd] = dia.data.split('-').map(Number);
        const check = getIsoWeekAndYear(new Date(yyyy, mm - 1, dd, 12, 0, 0));
        assert.equal(check.semana_ano, semana_ano);
        assert.equal(check.ano, ano);
      }
    });
  });
});
