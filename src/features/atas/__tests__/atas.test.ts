import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isValidHttpUrl,
  formatarDataAta,
  obterApelidoAutor,
  ordenarAtas,
  obterUltimaAta,
  podeGerenciarAtas,
  podeEditarLinkDrive,
  type AtaReuniao,
} from '../../../types/atas.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unit Tests: AtasScreen & Atas Logic (RN12)', () => {
  describe('Validação de URLs http/https', () => {
    it('deve aceitar links válidos http e https', () => {
      assert.equal(isValidHttpUrl('https://docs.google.com/document/d/xyz'), true);
      assert.equal(isValidHttpUrl('http://meudrive.com/pasta'), true);
    });

    it('deve rejeitar URLs sem protocolo http/https ou inválidas', () => {
      assert.equal(isValidHttpUrl('ftp://link'), false);
      assert.equal(isValidHttpUrl('javascript:void(0)'), false);
      assert.equal(isValidHttpUrl(''), false);
      assert.equal(isValidHttpUrl('apenas-texto'), false);
    });
  });

  describe('Formatação de Data e Apelido do Autor', () => {
    it('deve formatar data para DD/MM/AAAA', () => {
      assert.equal(formatarDataAta('2026-10-17'), '17/10/2026');
      assert.equal(formatarDataAta('2026-03-08T12:00:00Z'), '08/03/2026');
    });

    it('deve exibir prioritariamente o apelido do autor', () => {
      assert.equal(obterApelidoAutor({ id: '1', nome: 'Gabriel Silva', apelido: 'Cachorrão' }), 'Cachorrão');
      assert.equal(obterApelidoAutor({ id: '2', nome: 'Rodrigo Costa', apelido: null }), 'Rodrigo');
      assert.equal(obterApelidoAutor(null), 'Morador');
    });
  });

  describe('Ordenação e Última Ata', () => {
    const lista: AtaReuniao[] = [
      {
        id: '1',
        data_reuniao: '2026-05-10',
        url: 'https://docs.google.com/1',
        titulo: 'Ata Maio',
        publicada_por: null,
      },
      {
        id: '2',
        data_reuniao: '2026-10-17',
        url: 'https://docs.google.com/2',
        titulo: 'Ata Outubro',
        publicada_por: null,
      },
    ];

    it('a última ata deve ser a de maior data_reuniao', () => {
      const ultima = obterUltimaAta(lista);
      assert.equal(ultima?.id, '2');
      assert.equal(ultima?.titulo, 'Ata Outubro');
    });

    it('deve ordenar decrescente pela data', () => {
      const ordenadas = ordenarAtas(lista);
      assert.equal(ordenadas[0].id, '2');
      assert.equal(ordenadas[1].id, '1');
    });
  });

  describe('Permissões de Gerenciamento (RN12)', () => {
    it('morador ativo e admin podem gerenciar atas', () => {
      assert.equal(podeGerenciarAtas('morador', true), true);
      assert.equal(podeGerenciarAtas('admin', true), true);
    });

    it('morador inativo ou externo não podem gerenciar atas', () => {
      assert.equal(podeGerenciarAtas('morador', false), false);
      assert.equal(podeGerenciarAtas('externo', true), false);
    });

    it('apenas admin pode editar o link do Drive', () => {
      assert.equal(podeEditarLinkDrive('admin', true), true);
      assert.equal(podeEditarLinkDrive('morador', true), false);
    });
  });

  describe('Políticas RLS em supabase/schema.sql', () => {
    it('arquivo de schema deve conter políticas da seção 9', () => {
      const schemaPath = path.resolve(__dirname, '../../../../supabase/schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      assert.ok(sql.includes('Moradores ativos e admin leem atas'));
      assert.ok(sql.includes('Moradores ativos e admin publicam atas'));
      assert.ok(sql.includes('Apenas admin gerencia house_settings'));
    });
  });
});
