import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FUNCOES_OFICIAIS,
  calcularProximaRotacao,
  getIsoWeekAndYear,
  getDiasDaSemanaIso,
  obterRegraPorPontos,
  REGRAS_PONTOS_PADRAO,
} from '../../../types/faxina.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../../');
const schemaSqlPath = path.join(rootDir, 'supabase/schema.sql');
const vercelJsonPath = path.join(rootDir, 'vercel.json');
const netlifyTomlPath = path.join(rootDir, 'netlify.toml');
const quadroScreenPath = path.join(rootDir, 'src/features/faxina/QuadroPontosScreen.tsx');

describe('Database-First Faxina Rules & Deploy Config Tests (Feature 5)', () => {
  const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');

  describe('1. Presença de Funções Helper e Triggers RLS em supabase/schema.sql', () => {
    it('deve definir a função helper public.is_fiscal_halls como SECURITY DEFINER', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_fiscal_halls\s*\(/i,
        'Função public.is_fiscal_halls deve existir no schema SQL'
      );
      assert.match(
        schemaSql,
        /is_fiscal_halls[\s\S]*?SECURITY\s+DEFINER/i,
        'public.is_fiscal_halls deve ser declarada como SECURITY DEFINER'
      );
      assert.match(
        schemaSql,
        /LOWER\s*\(\s*TRIM\s*\(\s*ac\.nome\s*\)\s*\)\s*=\s*'halls'/i,
        'Deve validar pertinência à área Halls na semana informada'
      );
    });

    it('deve definir a função de trigger validate_and_apply_faxina_rules e seu gatilho', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.validate_and_apply_faxina_rules\s*\(/i,
        'Função trigger validate_and_apply_faxina_rules deve existir'
      );
      assert.match(
        schemaSql,
        /TRIGGER\s+trg_validate_and_apply_faxina_rules[\s\S]*?BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.registro_diario_faxina/i,
        'Gatilho trg_validate_and_apply_faxina_rules deve estar vinculado a BEFORE INSERT OR UPDATE ON registro_diario_faxina'
      );
      assert.match(
        schemaSql,
        /Você só pode enviar foto de comprovação para o seu próprio quarto/i,
        'Deve validar no banco que morador só envia foto do seu próprio quarto'
      );
      assert.match(
        schemaSql,
        /Apenas moradores do quarto escalado no Halls ou o Admin podem fiscalizar tarefas/i,
        'Deve validar no banco que apenas o quarto do Halls ou Admin fiscalizam'
      );
    });

    it('deve definir o trigger trg_faxina_reprovado_falta para acréscimo automático de faltas', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.apply_faxina_reprovado_falta\s*\(/i,
        'Função apply_faxina_reprovado_falta deve existir'
      );
      assert.match(
        schemaSql,
        /TRIGGER\s+trg_faxina_reprovado_falta[\s\S]*?AFTER\s+INSERT\s+OR\s+UPDATE\s+OF\s+fiscal_status\s+ON\s+public\.registro_diario_faxina/i,
        'Gatilho trg_faxina_reprovado_falta deve rodar AFTER INSERT OR UPDATE OF fiscal_status'
      );
      assert.match(
        schemaSql,
        /pontos_faltas\s*=\s*pontos_faltas\s*\+\s*1/i,
        'Deve incrementar pontos_faltas automaticamente no banco em caso de reprovação expressa'
      );
    });
  });

  describe('2. Políticas RLS Refinadas no Banco', () => {
    it('deve proteger public.regras_quadro_pontos: leitura pública e escrita restrita ao Admin', () => {
      assert.match(
        schemaSql,
        /CREATE\s+POLICY\s+"Todos podem ler regras do quadro de pontos"[\s\S]*?ON\s+public\.regras_quadro_pontos\s+FOR\s+SELECT\s+TO\s+anon,\s*authenticated/i,
        'Leitura pública de regras_quadro_pontos'
      );
      assert.match(
        schemaSql,
        /CREATE\s+POLICY\s+"Apenas admin gerencia regras de pontos"[\s\S]*?ON\s+public\.regras_quadro_pontos\s+FOR\s+ALL\s+TO\s+authenticated\s+USING\s*\(\s*public\.is_admin\(\)\s*\)/i,
        'Escrita de regras_quadro_pontos restrita a public.is_admin()'
      );
    });

    it('deve proteger public.escala_semanal_faxina: leitura pública e escrita manual restrita ao Admin', () => {
      assert.match(
        schemaSql,
        /CREATE\s+POLICY\s+"Todos podem ler escala semanal"[\s\S]*?ON\s+public\.escala_semanal_faxina\s+FOR\s+SELECT\s+TO\s+anon,\s*authenticated/i,
        'Leitura pública de escala_semanal_faxina'
      );
      assert.match(
        schemaSql,
        /CREATE\s+POLICY\s+"Apenas admin gerencia escala semanal"[\s\S]*?ON\s+public\.escala_semanal_faxina\s+FOR\s+ALL\s+TO\s+authenticated\s+USING\s*\(\s*public\.is_admin\(\)\s*\)/i,
        'Escrita direta em escala_semanal_faxina restrita a public.is_admin()'
      );
    });
  });

  describe('3. Stored Procedures RPC Nativas (SECURITY DEFINER)', () => {
    it('deve conter a RPC public.avancar_rodizio_faxina seguindo a ordem oficial', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.avancar_rodizio_faxina\s*\(\s*p_nova_semana\s+INT,\s*p_novo_ano\s+INT\s*\)/i,
        'RPC avancar_rodizio_faxina deve existir'
      );
      assert.match(
        schemaSql,
        /avancar_rodizio_faxina[\s\S]*?SECURITY\s+DEFINER/i,
        'avancar_rodizio_faxina deve ser SECURITY DEFINER'
      );
      assert.match(
        schemaSql,
        /sala de tv[\s\S]*?sala de estudos[\s\S]*?externo[\s\S]*?dispensa[\s\S]*?cozinha[\s\S]*?halls/i,
        'Deve mapear a ordem linear das 6 áreas canônicas da casa'
      );
    });

    it('deve conter a RPC public.garantir_quadro_faxina_atual', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.garantir_quadro_faxina_atual\s*\(/i,
        'RPC garantir_quadro_faxina_atual deve existir'
      );
      assert.match(
        schemaSql,
        /garantir_quadro_faxina_atual[\s\S]*?SECURITY\s+DEFINER/i,
        'garantir_quadro_faxina_atual deve ser SECURITY DEFINER'
      );
      assert.match(
        schemaSql,
        /PERFORM\s+public\.avancar_rodizio_faxina/i,
        'Deve avançar rodízio automaticamente se não houver escala atual'
      );
    });

    it('deve conter a RPC public.processar_corte_diario_01h com auditoria de fotos e virada aos domingos', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.processar_corte_diario_01h\s*\(/i,
        'RPC processar_corte_diario_01h deve existir'
      );
      assert.match(
        schemaSql,
        /processar_corte_diario_01h[\s\S]*?SECURITY\s+DEFINER/i,
        'processar_corte_diario_01h deve ser SECURITY DEFINER'
      );
      assert.match(
        schemaSql,
        /EXTRACT\s*\(\s*DOW\s+FROM\s+v_hoje\s*\)\s*=\s*0/i,
        'Deve verificar domingo (DOW = 0) para virar a semana'
      );
    });

    it('deve conter a RPC public.processar_auditoria_fiscal_11h para penalizar omissão do Halls', () => {
      assert.match(
        schemaSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.processar_auditoria_fiscal_11h\s*\(/i,
        'RPC processar_auditoria_fiscal_11h deve existir'
      );
      assert.match(
        schemaSql,
        /processar_auditoria_fiscal_11h[\s\S]*?SECURITY\s+DEFINER/i,
        'processar_auditoria_fiscal_11h deve ser SECURITY DEFINER'
      );
      assert.match(
        schemaSql,
        /SET\s+fiscal_status\s*=\s*'omitido'/i,
        'Deve marcar como omitido tarefas que o fiscal não avaliou até de manhã'
      );
    });
  });

  describe('4. Agendamento Automático via pg_cron', () => {
    it('deve conter as instruções seguras de schedule no cron para 01h, 11h e 15min', () => {
      assert.match(schemaSql, /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_cron/i);
      assert.match(
        schemaSql,
        /cron\.schedule\s*\(\s*'faxina_corte_diario_01h',\s*'0 4 \* \* \*'/i,
        '04:00 UTC = 01:00 BRT para corte diário'
      );
      assert.match(
        schemaSql,
        /cron\.schedule\s*\(\s*'faxina_auditoria_fiscal_11h',\s*'0 14 \* \* \*'/i,
        '14:00 UTC = 11:00 BRT para auditoria do fiscal'
      );
      assert.match(
        schemaSql,
        /cron\.schedule\s*\(\s*'pontos_bagunca_24h',\s*'\*\/15 \* \* \* \*'/i,
        'A cada 15 min para checagem de pontos expirados'
      );
    });
  });

  describe('5. Configurações de Deploy Contínuo (Vercel & Netlify)', () => {
    it('vercel.json deve existir e configurar SPA rewrite e cache headers de PWA', () => {
      assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json deve existir na raiz');
      const vercel = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

      assert.equal(vercel.framework, 'vite');
      assert.ok(
        vercel.rewrites?.some((r: any) => r.source === '/(.*)' && r.destination === '/index.html'),
        'Deve conter rewrite SPA /(.*) -> /index.html'
      );

      const pwaHeader = vercel.headers?.find((h: any) => h.source.includes('sw.js'));
      assert.ok(pwaHeader, 'Deve configurar headers de cache para sw.js');
      assert.ok(
        pwaHeader.headers?.some(
          (hdr: any) => hdr.key === 'Cache-Control' && hdr.value.includes('no-cache') || hdr.value.includes('max-age=0')
        ),
        'sw.js deve ter no-cache / max-age=0'
      );
    });

    it('netlify.toml deve existir e configurar SPA redirect e headers de cache de PWA', () => {
      assert.ok(fs.existsSync(netlifyTomlPath), 'netlify.toml deve existir na raiz');
      const netlifyContent = fs.readFileSync(netlifyTomlPath, 'utf8');

      assert.match(netlifyContent, /publish\s*=\s*"dist"/);
      assert.match(netlifyContent, /from\s*=\s*"\/\*"/);
      assert.match(netlifyContent, /to\s*=\s*"\/index\.html"/);
      assert.match(netlifyContent, /status\s*=\s*200/);
      assert.match(netlifyContent, /for\s*=\s*"\/sw\.js"/);
      assert.match(netlifyContent, /max-age=0/);
    });
  });

  describe('6. Consistência das Regras de Negócio da Faxina no TypeScript', () => {
    it('deve ter 6 funções oficiais canônicas terminando com Halls', () => {
      assert.equal(FUNCOES_OFICIAIS.length, 6);
      assert.equal(FUNCOES_OFICIAIS[5], 'Halls');
    });

    it('deve calcular a rotação circular oficial preservando bijeção dos 6 quartos', () => {
      const escala = [
        { quarto_id: 'q1', area_ordem: 0 },
        { quarto_id: 'q2', area_ordem: 1 },
        { quarto_id: 'q3', area_ordem: 2 },
        { quarto_id: 'q4', area_ordem: 3 },
        { quarto_id: 'q5', area_ordem: 4 },
        { quarto_id: 'q6', area_ordem: 5 },
      ];

      const prox = calcularProximaRotacao(escala);
      assert.equal(prox.length, 6);
      assert.equal(prox[0].proxima_area_ordem, 1);
      assert.equal(prox[5].proxima_area_ordem, 0); // Halls volta para Sala de TV
    });

    it('deve obter regras progressivas padrão de 2 a 7 pontos', () => {
      assert.equal(obterRegraPorPontos(1), null);
      assert.equal(obterRegraPorPontos(2)?.descricao, REGRAS_PONTOS_PADRAO[0].descricao);
      assert.equal(obterRegraPorPontos(7)?.descricao, REGRAS_PONTOS_PADRAO[5].descricao);
      assert.equal(obterRegraPorPontos(9)?.pontos, 7); // Clamped no nível máximo
    });

    it('deve calcular semana ISO coerente com a regra do calendário', () => {
      const res = getIsoWeekAndYear(new Date('2026-10-17T12:00:00Z'));
      assert.ok(res.semana_ano >= 1 && res.semana_ano <= 53);
      assert.equal(res.ano, 2026);
    });

    it('deve retornar os 7 dias da semana ISO (Seg a Dom) para a semana informada', () => {
      const dias = getDiasDaSemanaIso(43, 2026);
      assert.equal(dias.length, 7);
      assert.deepEqual(
        dias.map((d) => d.sigla),
        ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
      );
      for (const dia of dias) {
        assert.match(dia.data, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(dia.diaMes, /^\d{2}\/\d{2}$/);
      }
    });
  });

  describe('7. Melhorias de UI no Quadro de Pontos (Dias da Semana, Substituição de Foto e Aba Fiscal)', () => {
    const quadroScreenCode = fs.readFileSync(quadroScreenPath, 'utf8');

    it('deve consultar todas as tarefas da semana em registro_diario_faxina (.eq("semana_ano", semana_ano))', () => {
      assert.match(
        quadroScreenCode,
        /from\('registro_diario_faxina'\)[\s\S]*?\.eq\('semana_ano',\s*semana_ano\)/,
        'Deve buscar todas as tarefas da semana atual para alimentar a barra dos 7 dias'
      );
    });

    it('deve manter o input fileInputRef montado fora da condicional para permitir substituir foto já enviada', () => {
      const idxInput = quadroScreenCode.indexOf('ref={fileInputRef}');
      const idxTernary = quadroScreenCode.indexOf("minhaTarefaHoje?.status === 'cumprido' ?");
      assert.ok(idxInput > 0 && idxTernary > 0, 'Deve conter fileInputRef e ternário de status cumprido');
      assert.ok(
        idxInput < idxTernary,
        'O <input ref={fileInputRef} /> deve estar montado antes do ternário para funcionar também na substituição'
      );
      assert.match(
        quadroScreenCode,
        /já enviou a foto de hoje!/,
        'Deve exibir aviso quando outro morador do quarto já enviou a foto'
      );
      assert.match(
        quadroScreenCode,
        /Substituir foto enviada/,
        'Deve exibir botão claro para substituir a foto enviada'
      );
    });

    it('deve renderizar a aba Fiscal (Halls) condicionalmente apenas quando souFiscal for verdadeiro', () => {
      assert.match(
        quadroScreenCode,
        /\{souFiscal\s*&&\s*\(\s*<button[\s\S]*?setActiveTab\('fiscal'\)[\s\S]*?Fiscal \(Halls\)/,
        'A aba Fiscal (Halls) só deve ser exibida para o quarto do Halls na semana ou Admin'
      );
    });
  });
});
