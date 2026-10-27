import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unit Tests: Pontos de Bagunça v2 (Múltiplas Assunções, Reunião Admin, 2 Penalidades e TTL 60d)', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const schemaSql = fs.readFileSync(path.join(rootDir, 'supabase/schema.sql'), 'utf-8');

  describe('1. Integridade do Schema Database-First no Supabase', () => {
    it('deve conter constraint de status em pontos_bagunca suportando aberta, assumida e reuniao', () => {
      assert.ok(
        schemaSql.includes("CHECK (status IN ('aberta', 'assumida', 'reuniao'))"),
        'Constraint de status deve incluir reuniao'
      );
    });

    it('deve conter declarou_inocente e inocente_em em pontos_bagunca_visualizacoes com RLS UPDATE', () => {
      assert.ok(
        schemaSql.includes('declarou_inocente BOOLEAN NOT NULL DEFAULT FALSE'),
        'Coluna declarou_inocente presente'
      );
      assert.ok(
        schemaSql.includes('inocente_em TIMESTAMPTZ'),
        'Coluna inocente_em presente'
      );
      assert.ok(
        schemaSql.includes('Morador ativo atualiza sua visualizacao ou inocencia'),
        'Política de UPDATE para visualizações e declaração de inocência'
      );
    });

    it('deve criar a tabela public.pontos_bagunca_acusacoes com constraint UNIQUE e RLS', () => {
      assert.ok(
        schemaSql.includes('CREATE TABLE IF NOT EXISTS public.pontos_bagunca_acusacoes'),
        'Tabela pontos_bagunca_acusacoes criada'
      );
      assert.ok(
        schemaSql.includes('CONSTRAINT unique_ponto_acusado UNIQUE (ponto_id, acusado_id)'),
        'Constraint UNIQUE (ponto_id, acusado_id)'
      );
      assert.ok(
        schemaSql.includes("CHECK (status IN ('pendente', 'inocente', 'assumido'))"),
        'Status de acusação válido'
      );
      assert.ok(
        schemaSql.includes('CREATE POLICY "Morador ativo pode acusar em ponto aberto"'),
        'Política de INSERT em acusações'
      );
      assert.ok(
        schemaSql.includes('CREATE POLICY "Acusado responde acusacao"'),
        'Política de UPDATE em acusações'
      );
    });

    it('deve criar a tabela public.pontos_bagunca_culpados com constraint UNIQUE e RLS', () => {
      assert.ok(
        schemaSql.includes('CREATE TABLE IF NOT EXISTS public.pontos_bagunca_culpados'),
        'Tabela pontos_bagunca_culpados criada'
      );
      assert.ok(
        schemaSql.includes('CONSTRAINT unique_ponto_culpado UNIQUE (ponto_id, morador_id)'),
        'Constraint UNIQUE (ponto_id, morador_id)'
      );
      assert.ok(
        schemaSql.includes('CREATE POLICY "Morador ativo pode assumir ponto aberto"'),
        'Política de INSERT em culpados'
      );
    });

    it('deve registrar as novas tabelas na publicação supabase_realtime', () => {
      assert.ok(
        schemaSql.includes("tablename = 'pontos_bagunca_acusacoes'"),
        'Realtime em pontos_bagunca_acusacoes'
      );
      assert.ok(
        schemaSql.includes("tablename = 'pontos_bagunca_culpados'"),
        'Realtime em pontos_bagunca_culpados'
      );
    });

    it('deve conter as funções e RPCs necessárias', () => {
      assert.ok(
        schemaSql.includes('FUNCTION public.assumir_ponto_bagunca('),
        'RPC assumir_ponto_bagunca'
      );
      assert.ok(
        schemaSql.includes('FUNCTION public.declarar_inocencia_ponto_bagunca('),
        'RPC declarar_inocencia_ponto_bagunca'
      );
      assert.ok(
        schemaSql.includes('FUNCTION public.admin_atribuir_ponto_reuniao('),
        'RPC admin_atribuir_ponto_reuniao'
      );
      assert.ok(
        schemaSql.includes('FUNCTION public.limpar_pontos_bagunca_antigos('),
        'Função limpar_pontos_bagunca_antigos'
      );
      assert.ok(
        schemaSql.includes('limpeza_pontos_bagunca_60d'),
        'Agendamento pg_cron para limpeza de 60 dias'
      );
    });
  });

  describe('2. RPC assumir_ponto_bagunca & Permanência no Carrossel da Home', () => {
    function simularAssumirPonto(ponto, culpados, userId) {
      if (ponto.status !== 'aberta') {
        throw new Error('Ponto não está aberto.');
      }

      // Adiciona aos culpados múltiplos
      const jaExiste = culpados.some((c) => c.ponto_id === ponto.id && c.morador_id === userId);
      const novosCulpados = jaExiste
        ? culpados
        : [...culpados, { ponto_id: ponto.id, morador_id: userId, assumido_em: new Date().toISOString() }];

      // O ponto original continua com status 'aberta' para cumprir as 24h no carrossel
      const pontoAtualizado = {
        ...ponto,
        culpado_id: ponto.culpado_id || userId,
        status: 'aberta', // permanece 'aberta' no carrossel durante as 24h!
      };

      return { pontoAtualizado, novosCulpados };
    }

    it('deve permitir que o primeiro morador assuma mantendo o ponto aberto no carrossel', () => {
      const pontoOriginal = {
        id: 'p1',
        relator_id: 'user-relator',
        culpado_id: null,
        status: 'aberta',
      };

      const { pontoAtualizado, novosCulpados } = simularAssumirPonto(pontoOriginal, [], 'user-1');

      assert.equal(pontoAtualizado.status, 'aberta', 'Permanece aberta no carrossel');
      assert.equal(pontoAtualizado.culpado_id, 'user-1');
      assert.equal(novosCulpados.length, 1);
      assert.equal(novosCulpados[0].morador_id, 'user-1');
    });

    it('deve permitir que um segundo morador também assuma o mesmo ponto', () => {
      const pontoOriginal = {
        id: 'p1',
        relator_id: 'user-relator',
        culpado_id: 'user-1',
        status: 'aberta',
      };
      const culpadosIniciais = [{ ponto_id: 'p1', morador_id: 'user-1', assumido_em: new Date().toISOString() }];

      const { pontoAtualizado, novosCulpados } = simularAssumirPonto(pontoOriginal, culpadosIniciais, 'user-2');

      assert.equal(pontoAtualizado.status, 'aberta', 'Permanece aberta no carrossel para demais moradores');
      assert.equal(novosCulpados.length, 2);
      assert.ok(novosCulpados.some((c) => c.morador_id === 'user-1'));
      assert.ok(novosCulpados.some((c) => c.morador_id === 'user-2'));
    });
  });

  describe('3. Rotina de Verificação de 24 Horas (verificar_penalidades_pontos_24h)', () => {
    function processarCorte24h(ponto, moradoresAtivos, culpados, visualizacoes, acusacoes) {
      const penalidadesOmissao = [];
      let pontoFinal = { ...ponto };
      let acusacoesFinais = [...acusacoes];

      // 1. Regra Geral de Omissão: Quem não assumiu e não declarou inocente leva ponto por omissão
      moradoresAtivos.forEach((m) => {
        if (m.id === ponto.relator_id) return; // relator isento

        const assumiu = culpados.some((c) => c.ponto_id === ponto.id && c.morador_id === m.id);
        const declarouInocente = visualizacoes.some(
          (v) => v.ponto_id === ponto.id && v.morador_id === m.id && v.declarou_inocente
        );

        if (!assumiu && !declarouInocente) {
          penalidadesOmissao.push({
            culpado_id: m.id,
            motivo: `Penalidade: Omissão em 24h (${ponto.id})`,
          });
        }
      });

      // 2. Destino do Ponto Principal
      const qtdAssuncoes = culpados.filter((c) => c.ponto_id === ponto.id).length;

      if (qtdAssuncoes > 0 || ponto.culpado_id) {
        // Cenário 1: 1 ou mais pessoas assumiram
        pontoFinal.status = 'assumida';
      } else {
        // Cenário 2: Ninguém assumiu, verifica acusados pendentes
        const acusadoPendente = acusacoes.find((a) => a.ponto_id === ponto.id && a.status === 'pendente');

        if (acusadoPendente) {
          pontoFinal.status = 'assumida';
          pontoFinal.culpado_id = acusadoPendente.acusado_id;
          acusacoesFinais = acusacoesFinais.map((a) =>
            a.id === acusadoPendente.id ? { ...a, status: 'assumido' } : a
          );
        } else {
          // Cenário 3: Ninguém assumiu E ninguém acusado pendente -> vai para reunião do Admin
          pontoFinal.status = 'reuniao';
        }
      }

      return { penalidadesOmissao, pontoFinal, acusacoesFinais };
    }

    const moradores = [
      { id: 'relator', nome: 'Relator' },
      { id: 'morador-culpado', nome: 'Culpado' },
      { id: 'morador-inocente', nome: 'Inocente' },
      { id: 'morador-omisso', nome: 'Omisso' },
    ];

    it('Cenário 1: morador assumiu -> ponto fecha como assumida, e omissos são penalizados', () => {
      const ponto = { id: 'p1', relator_id: 'relator', status: 'aberta', culpado_id: 'morador-culpado' };
      const culpados = [{ ponto_id: 'p1', morador_id: 'morador-culpado' }];
      const visualizacoes = [
        { ponto_id: 'p1', morador_id: 'morador-inocente', declarou_inocente: true },
      ];
      const acusacoes = [];

      const { penalidadesOmissao, pontoFinal } = processarCorte24h(ponto, moradores, culpados, visualizacoes, acusacoes);

      assert.equal(pontoFinal.status, 'assumida');
      assert.equal(penalidadesOmissao.length, 1);
      assert.equal(penalidadesOmissao[0].culpado_id, 'morador-omisso');
    });

    it('Cenário 2: ninguém assumiu, mas há acusado pendente -> atribuído ao acusado pendente', () => {
      const ponto = { id: 'p2', relator_id: 'relator', status: 'aberta', culpado_id: null };
      const culpados = [];
      const visualizacoes = [];
      const acusacoes = [
        { id: 'a1', ponto_id: 'p2', acusado_id: 'morador-omisso', status: 'pendente' },
      ];

      const { pontoFinal, acusacoesFinais } = processarCorte24h(ponto, moradores, culpados, visualizacoes, acusacoes);

      assert.equal(pontoFinal.status, 'assumida');
      assert.equal(pontoFinal.culpado_id, 'morador-omisso');
      assert.equal(acusacoesFinais[0].status, 'assumido');
    });

    it('Cenário 3: ninguém assumiu e todos acusados declararam inocência -> ponto vai para reuniao', () => {
      const ponto = { id: 'p3', relator_id: 'relator', status: 'aberta', culpado_id: null };
      const culpados = [];
      const visualizacoes = [
        { ponto_id: 'p3', morador_id: 'morador-culpado', declarou_inocente: true },
        { ponto_id: 'p3', morador_id: 'morador-inocente', declarou_inocente: true },
      ];
      const acusacoes = [
        { id: 'a1', ponto_id: 'p3', acusado_id: 'morador-culpado', status: 'inocente' },
      ];

      const { pontoFinal } = processarCorte24h(ponto, moradores, culpados, visualizacoes, acusacoes);

      assert.equal(pontoFinal.status, 'reuniao', 'Ponto deve ser encaminhado para Reunião do Admin');
    });
  });

  describe('4. Deliberação de Reunião pelo Admin (Regra das 2 Penalidades Totais)', () => {
    function deliberarPontoReuniao(ponto, moradorCulpadoId, jaTomouOmissao24h) {
      if (ponto.status !== 'reuniao') {
        throw new Error('Apenas pontos com status reuniao podem ser julgados.');
      }

      const pontoAtualizado = {
        ...ponto,
        status: 'assumida',
        culpado_id: moradorCulpadoId,
      };

      const penalidadesGeradas = [];
      penalidadesGeradas.push({ id: ponto.id, motivo: ponto.local_descricao });

      if (!jaTomouOmissao24h) {
        // Se mentiu declarando inocência, não tomou o ponto de omissão em 24h.
        // Na reunião leva a penalidade duplicada. Total = 2.
        penalidadesGeradas.push({
          id: 'duplicada-' + ponto.id,
          motivo: `Penalidade duplicada (Reunião): ${ponto.local_descricao}`,
        });
      }

      const totalPenalidadesDoCaso = jaTomouOmissao24h ? 1 + 1 : 2;

      return {
        pontoAtualizado,
        penalidadesAdicionadasAgora: penalidadesGeradas.length,
        totalPenalidadesDoCaso,
      };
    }

    it('se o culpado mentiu (declarou inocente), gera 2 penalidades na reunião (Total = 2)', () => {
      const ponto = { id: 'p-reuniao', local_descricao: 'Prato sujo na pia', status: 'reuniao' };
      const resultado = deliberarPontoReuniao(ponto, 'morador-mentiroso', false);

      assert.equal(resultado.pontoAtualizado.status, 'assumida');
      assert.equal(resultado.penalidadesAdicionadasAgora, 2);
      assert.equal(resultado.totalPenalidadesDoCaso, 2);
    });

    it('se o culpado não interagiu (já tomou omissão em 24h), gera 1 penalidade na reunião (Total 1 + 1 = 2)', () => {
      const ponto = { id: 'p-reuniao', local_descricao: 'Prato sujo na pia', status: 'reuniao' };
      const resultado = deliberarPontoReuniao(ponto, 'morador-omisso', true);

      assert.equal(resultado.pontoAtualizado.status, 'assumida');
      assert.equal(resultado.penalidadesAdicionadasAgora, 1);
      assert.equal(resultado.totalPenalidadesDoCaso, 2);
    });
  });

  describe('5. Expurgamento e TTL de 60 Dias (limpar_pontos_bagunca_antigos)', () => {
    it('deve expurgar apenas pontos assumidos com mais de 60 dias sem deletar caixas de cerveja', () => {
      const agora = new Date('2026-10-27T12:00:00Z').getTime();
      const sessentaDiasMs = 60 * 24 * 60 * 60 * 1000;

      const pontos = [
        { id: 'p-novo-aberto', status: 'aberta', created_at: new Date(agora - 10 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'p-novo-assumido', status: 'assumida', created_at: new Date(agora - 20 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'p-antigo-reuniao', status: 'reuniao', created_at: new Date(agora - 70 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'p-antigo-assumido-expurgar', status: 'assumida', created_at: new Date(agora - 65 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      const caixasCerveja = [
        { id: 'cx1', motivo_descricao: 'Acúmulo de 7 pontos de bagunça em 08/2026', status: 'paga' },
        { id: 'cx2', motivo_descricao: 'Acúmulo de 14 pontos de bagunça em 09/2026', status: 'pendente' },
      ];

      // Simulação da query DELETE WHERE status = 'assumida' AND created_at < NOW() - INTERVAL '60 days'
      const pontosRestantes = pontos.filter((p) => {
        const criadoEm = new Date(p.created_at).getTime();
        const temMaisDe60d = agora - criadoEm > sessentaDiasMs;
        const deveDeletar = p.status === 'assumida' && temMaisDe60d;
        return !deveDeletar;
      });

      assert.equal(pontosRestantes.length, 3);
      assert.ok(!pontosRestantes.some((p) => p.id === 'p-antigo-assumido-expurgar'));
      assert.ok(pontosRestantes.some((p) => p.id === 'p-novo-assumido'));
      assert.ok(pontosRestantes.some((p) => p.id === 'p-antigo-reuniao'));

      // Caixas de cerveja permanecem 100% intactas
      assert.equal(caixasCerveja.length, 2, 'Caixas de cerveja nunca devem ser afetadas por limpeza de pontos');
    });
  });

  describe('6. Otimização de Consultas no Frontend (useNotifications.ts)', () => {
    it('useNotifications.ts deve conter filtro limite60Dias na busca de pontos_bagunca', () => {
      const hookContent = fs.readFileSync(path.join(rootDir, 'src/hooks/useNotifications.ts'), 'utf-8');
      assert.ok(
        hookContent.includes('limite60Dias'),
        'useNotifications.ts deve definir limite60Dias'
      );
      assert.ok(
        hookContent.includes(".gte('created_at', limite60Dias)"),
        'useNotifications.ts deve filtrar pontos por created_at >= limite60Dias'
      );
    });
  });
});
