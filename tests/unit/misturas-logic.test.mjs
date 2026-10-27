import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  marcaToNumeric,
  numericToMarca,
  getLocalDateString,
  formatarDataExtenso,
  calcularResumoMisturas,
  isWeekendDateString,
  getAdjacentWeekday,
  getInitialMisturasDate,
} from '../../src/types/refeicoes.ts';

describe('Unit Tests: Folha de Misturas Digital (Regras de Negócio RN01)', () => {
  describe('1. Mapeamento de Símbolos Tradicionais da Folha física para Supabase', () => {
    it('deve converter — para 0.0 misturas consumidas', () => {
      assert.equal(marcaToNumeric('—'), 0.0);
    });

    it('deve converter 1/2 para 0.5 misturas (cota de almoço)', () => {
      assert.equal(marcaToNumeric('1/2'), 0.5);
    });

    it('deve converter X para 1.0 misturas (cota cheia de 2 misturas)', () => {
      assert.equal(marcaToNumeric('X'), 1.0);
    });

    it('deve converter valores numéricos do Supabase de volta para os símbolos da folha física', () => {
      assert.equal(numericToMarca(0.0), '—');
      assert.equal(numericToMarca(0.5), '1/2');
      assert.equal(numericToMarca(1.0), 'X');
      assert.equal(numericToMarca(null), '—');
      assert.equal(numericToMarca(undefined), '—');
    });
  });

  describe('2. Cálculo Consolidado de Misturas do Dia para a Cozinha', () => {
    const mockMoradores = [
      { id: 'u1', nome: 'Rodrigo Cachorrão', ativo: true },
      { id: 'u2', nome: 'Lucas Jumento', ativo: true },
      { id: 'u3', nome: 'Matheus 025', ativo: true },
      { id: 'u4', nome: 'Pedro Valéria', ativo: true },
      { id: 'u5', nome: 'Gabriel Caixinha', ativo: true },
    ];

    it('deve calcular corretamente quando parte comeu almoço e janta e outros não comeram', () => {
      const mealsMap = {
        u1: 0.5, // 1 mistura
        u2: 1.0, // 2 misturas
        u3: 0.5, // 1 mistura
        u4: 0.0, // 0 misturas
        // u5 não preencheu (default 0.0)
      };

      const resumo = calcularResumoMisturas(mockMoradores, mealsMap);

      assert.equal(resumo.totalMisturas, 2.0, '0.5 + 1.0 + 0.5 = 2.0 misturas no total');
      assert.equal(resumo.totalPessoas, 3, '3 moradores comeram na república no dia');
      assert.equal(resumo.totalCheia, 1, '1 morador consumiu cota cheia (X)');
      assert.equal(resumo.totalMeia, 2, '2 moradores consumiram meia cota (1/2)');
      assert.equal(resumo.totalVazio, 2, '2 moradores não comeram (u4 marcou 0 e u5 não marcou)');
    });

    it('deve zerar corretamente quando ninguém marcou refeição', () => {
      const resumo = calcularResumoMisturas(mockMoradores, {});
      assert.equal(resumo.totalMisturas, 0);
      assert.equal(resumo.totalPessoas, 0);
      assert.equal(resumo.totalVazio, 5);
      assert.equal(resumo.totalMeia, 0);
      assert.equal(resumo.totalCheia, 0);
    });
  });

  describe('3. Tratamento de Datas e Fusos Horários', () => {
    it('getLocalDateString deve retornar data no formato YYYY-MM-DD sem distorção de timezone', () => {
      const dataFixa = new Date(2026, 9, 15, 23, 30); // 15 de Outubro de 2026 às 23:30 local
      const str = getLocalDateString(dataFixa);
      assert.equal(str, '2026-10-15');
    });

    it('formatarDataExtenso deve formatar com dia da semana e mês em português', () => {
      const formatado = formatarDataExtenso('2026-10-15');
      assert.ok(formatado.toLowerCase().includes('outubro'), 'Deve conter o mês por extenso');
    });

    it('deve validar que datas futuras (dias > hoje) são estritamente bloqueadas', () => {
      const hoje = getLocalDateString(new Date());
      const amanhaDate = new Date();
      amanhaDate.setDate(amanhaDate.getDate() + 1);
      const amanha = getLocalDateString(amanhaDate);

      assert.ok(amanha > hoje, 'Amanhã deve ser estritamente maior que hoje na ordenação cronológica ISO');
      
      // Simula a trava aplicada na tela de misturas
      const tentarAvancarDia = (dataAtual, hojeStr) => {
        const [ano, mes, dia] = dataAtual.split('-').map(Number);
        const d = new Date(ano, mes - 1, dia);
        d.setDate(d.getDate() + 1);
        const novaData = getLocalDateString(d);
        if (novaData > hojeStr) return dataAtual; // Bloqueado, mantém na data atual
        return novaData;
      };

      const resultadoTentativa = tentarAvancarDia(hoje, hoje);
      assert.equal(resultadoTentativa, hoje, 'Não deve avançar para o futuro quando já estiver no dia de hoje');
    });

    it('deve validar que dias anteriores (dias < hoje) são apenas visualizáveis e bloqueados para alteração', () => {
      const hoje = getLocalDateString(new Date());
      const ontemDate = new Date();
      ontemDate.setDate(ontemDate.getDate() - 1);
      const ontem = getLocalDateString(ontemDate);

      assert.ok(ontem < hoje, 'Ontem deve ser estritamente menor que hoje');

      const isDataEditavel = (dataSelecionada, hojeStr) => dataSelecionada === hojeStr;

      assert.equal(isDataEditavel(ontem, hoje), false, 'Dia anterior não deve ser editável');
      assert.equal(isDataEditavel(hoje, hoje), true, 'Dia de hoje deve ser editável');
    });
  });

  describe('4. Bloqueio e Navegação de Finais de Semana (Sábado e Domingo)', () => {
    it('isWeekendDateString deve identificar corretamente Sábado e Domingo como fim de semana', () => {
      // 2026-10-12 (Segunda) a 2026-10-16 (Sexta)
      assert.equal(isWeekendDateString('2026-10-12'), false, 'Segunda não é fim de semana');
      assert.equal(isWeekendDateString('2026-10-13'), false, 'Terça não é fim de semana');
      assert.equal(isWeekendDateString('2026-10-14'), false, 'Quarta não é fim de semana');
      assert.equal(isWeekendDateString('2026-10-15'), false, 'Quinta não é fim de semana');
      assert.equal(isWeekendDateString('2026-10-16'), false, 'Sexta não é fim de semana');

      // Fim de semana
      assert.equal(isWeekendDateString('2026-10-17'), true, 'Sábado deve ser fim de semana');
      assert.equal(isWeekendDateString('2026-10-18'), true, 'Domingo deve ser fim de semana');
    });

    it('getAdjacentWeekday deve retroceder pulando fins de semana (de Segunda direto para Sexta)', () => {
      // De Segunda 19/10/2026 voltando 1 dia útil -> deve pular Domingo 18 e Sábado 17, caindo na Sexta 16/10/2026
      const anterior = getAdjacentWeekday('2026-10-19', -1);
      assert.equal(anterior, '2026-10-16', 'Voltando da Segunda pula o fim de semana e vai para Sexta');

      // De Sábado 17/10/2026 voltando 1 dia útil -> Sexta 16/10/2026
      assert.equal(getAdjacentWeekday('2026-10-17', -1), '2026-10-16');

      // De Domingo 18/10/2026 voltando 1 dia útil -> Sexta 16/10/2026
      assert.equal(getAdjacentWeekday('2026-10-18', -1), '2026-10-16');

      // De Terça 20/10/2026 voltando 1 dia útil -> Segunda 19/10/2026
      assert.equal(getAdjacentWeekday('2026-10-20', -1), '2026-10-19');
    });

    it('getAdjacentWeekday deve avançar pulando fins de semana (de Sexta direto para Segunda)', () => {
      // De Sexta 16/10/2026 avançando com maxDate 20/10/2026 -> deve pular Sábado 17 e Domingo 18, caindo na Segunda 19/10/2026
      const proximo = getAdjacentWeekday('2026-10-16', 1, '2026-10-20');
      assert.equal(proximo, '2026-10-19', 'Avançando da Sexta pula o fim de semana e vai para Segunda');

      // De Segunda 19/10/2026 avançando -> Terça 20/10/2026
      assert.equal(getAdjacentWeekday('2026-10-19', 1, '2026-10-20'), '2026-10-20');
    });

    it('getAdjacentWeekday deve respeitar o teto de maxDateStr impedindo avanço para o futuro', () => {
      // Sexta 16/10/2026 com maxDate sendo a própria Sexta -> não pode avançar
      const ret = getAdjacentWeekday('2026-10-16', 1, '2026-10-16');
      assert.equal(ret, '2026-10-16', 'Não pode ultrapassar maxDate');

      // Sábado 17/10/2026 com maxDate sendo o Sábado -> próximo dia útil (Segunda 19) excede maxDate, mantém no Sábado
      const retSab = getAdjacentWeekday('2026-10-17', 1, '2026-10-17');
      assert.equal(retSab, '2026-10-17', 'Não deve avançar além de maxDate');
    });

    it('getInitialMisturasDate deve retornar a data do dia para exibição clara do banner de fim de semana', () => {
      assert.equal(getInitialMisturasDate('2026-10-17'), '2026-10-17');
      assert.equal(getInitialMisturasDate('2026-10-19'), '2026-10-19');
    });
  });
});


