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
} from '../../src/types/atas.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unit Tests: Atas de Reunião & Link do Drive (RN12)', () => {
  describe('1. Validação de URLs HTTP/HTTPS (isValidHttpUrl)', () => {
    it('deve aceitar URLs HTTPS válidas (ex: Google Docs, Google Drive)', () => {
      assert.equal(
        isValidHttpUrl('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'),
        true
      );
      assert.equal(
        isValidHttpUrl('https://drive.google.com/drive/folders/1234567890abcdef'),
        true
      );
      assert.equal(isValidHttpUrl('https://cantagrillo.app'), true);
    });

    it('deve aceitar URLs HTTP válidas', () => {
      assert.equal(isValidHttpUrl('http://meudominio.com/ata.pdf'), true);
      assert.equal(isValidHttpUrl('http://localhost:3000'), true);
    });

    it('deve aceitar URLs com espaços antes ou depois (trimming)', () => {
      assert.equal(isValidHttpUrl('   https://docs.google.com/document/d/123   '), true);
    });

    it('deve rejeitar URLs sem protocolo http ou https (ex: javascript, ftp, file, tel)', () => {
      assert.equal(isValidHttpUrl('ftp://servidor.com/ata.pdf'), false);
      assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
      assert.equal(isValidHttpUrl('file:///etc/passwd'), false);
      assert.equal(isValidHttpUrl('mailto:rep@cantagrillo.app'), false);
    });

    it('deve rejeitar strings vazias, valores nulos, indefinidos ou texto comum', () => {
      assert.equal(isValidHttpUrl(''), false);
      assert.equal(isValidHttpUrl('    '), false);
      assert.equal(isValidHttpUrl(null), false);
      assert.equal(isValidHttpUrl(undefined), false);
      assert.equal(isValidHttpUrl('docs.google.com/sem-protocolo'), false);
      assert.equal(isValidHttpUrl('qualquer-coisa'), false);
    });
  });

  describe('2. Formatação de Data sem Desvio de Timezone (formatarDataAta)', () => {
    it('deve formatar data YYYY-MM-DD para DD/MM/AAAA', () => {
      assert.equal(formatarDataAta('2026-10-17'), '17/10/2026');
      assert.equal(formatarDataAta('2026-01-05'), '05/01/2026');
      assert.equal(formatarDataAta('2025-12-31'), '31/12/2025');
    });

    it('deve extrair e formatar a data mesmo se vier com timestamp ISO', () => {
      assert.equal(formatarDataAta('2026-10-17T20:30:00Z'), '17/10/2026');
      assert.equal(formatarDataAta('2026-05-01T03:00:00.000Z'), '01/05/2026');
    });

    it('deve lidar com valores vazios ou nulos', () => {
      assert.equal(formatarDataAta(''), '');
      assert.equal(formatarDataAta(null), '');
      assert.equal(formatarDataAta(undefined), '');
    });
  });

  describe('3. Exibição Estrita de Apelido do Autor (obterApelidoAutor)', () => {
    it('deve priorizar sempre o apelido quando disponível', () => {
      const autor = {
        id: 'user-1',
        nome: 'Rodrigo César Oliveira',
        apelido: 'Cachorrão',
      };
      assert.equal(obterApelidoAutor(autor), 'Cachorrão');
    });

    it('deve fazer fallback para o primeiro nome se o apelido for nulo, indefinido ou vazio', () => {
      assert.equal(
        obterApelidoAutor({ id: 'user-2', nome: 'Gabriel Silva', apelido: null }),
        'Gabriel'
      );
      assert.equal(
        obterApelidoAutor({ id: 'user-2', nome: 'Lucas Medeiros', apelido: '   ' }),
        'Lucas'
      );
      assert.equal(
        obterApelidoAutor({ id: 'user-2', nome: 'Matheus Pereira', apelido: undefined }),
        'Matheus'
      );
    });

    it('deve retornar "Morador" caso autor seja nulo, vazio ou sem dados', () => {
      assert.equal(obterApelidoAutor(null), 'Morador');
      assert.equal(obterApelidoAutor(undefined), 'Morador');
      assert.equal(obterApelidoAutor({ id: 'user-3', nome: '', apelido: null }), 'Morador');
    });
  });

  describe('4. Ordenação e Derivação da Última Ata (ordenarAtas & obterUltimaAta)', () => {
    const atas = [
      {
        id: 'ata-1',
        data_reuniao: '2026-08-10',
        url: 'https://docs.google.com/1',
        titulo: 'Reunião de Agosto',
        publicada_por: 'u1',
        created_at: '2026-08-10T19:00:00Z',
      },
      {
        id: 'ata-3',
        data_reuniao: '2026-10-15',
        url: 'https://docs.google.com/3',
        titulo: 'Reunião Extraordinária Outubro',
        publicada_por: 'u2',
        created_at: '2026-10-15T21:00:00Z',
      },
      {
        id: 'ata-2',
        data_reuniao: '2026-09-01',
        url: 'https://docs.google.com/2',
        titulo: 'Reunião de Setembro',
        publicada_por: 'u1',
        created_at: '2026-09-01T18:00:00Z',
      },
    ];

    it('deve ordenar atas por data_reuniao decrescente', () => {
      const ordenadas = ordenarAtas(atas);
      assert.equal(ordenadas.length, 3);
      assert.equal(ordenadas[0].id, 'ata-3');
      assert.equal(ordenadas[1].id, 'ata-2');
      assert.equal(ordenadas[2].id, 'ata-1');
    });

    it('deve desempate por created_at decrescente se a data_reuniao for idêntica', () => {
      const atasMesmoDia = [
        {
          id: 'ata-cedo',
          data_reuniao: '2026-10-10',
          url: 'https://docs.google.com/cedo',
          titulo: 'Pauta Manhã',
          publicada_por: 'u1',
          created_at: '2026-10-10T10:00:00Z',
        },
        {
          id: 'ata-tarde',
          data_reuniao: '2026-10-10',
          url: 'https://docs.google.com/tarde',
          titulo: 'Pauta Tarde',
          publicada_por: 'u1',
          created_at: '2026-10-10T17:00:00Z',
        },
      ];

      const ordenadas = ordenarAtas(atasMesmoDia);
      assert.equal(ordenadas[0].id, 'ata-tarde');
      assert.equal(ordenadas[1].id, 'ata-cedo');
    });

    it('deve identificar a "Última Ata" como a ata de maior data_reuniao', () => {
      const ultima = obterUltimaAta(atas);
      assert.ok(ultima);
      assert.equal(ultima.id, 'ata-3');
      assert.equal(ultima.data_reuniao, '2026-10-15');
    });

    it('deve retornar null ao obter última ata de lista vazia ou nula', () => {
      assert.equal(obterUltimaAta([]), null);
      assert.equal(obterUltimaAta(null), null);
      assert.equal(obterUltimaAta(undefined), null);
    });
  });

  describe('5. Controle de Permissões RN12 (podeGerenciarAtas & podeEditarLinkDrive)', () => {
    it('morador ativo pode publicar, editar e excluir atas de reunião', () => {
      assert.equal(podeGerenciarAtas('morador', true), true);
    });

    it('administrador pode gerenciar atas de reunião', () => {
      assert.equal(podeGerenciarAtas('admin', true), true);
      assert.equal(podeGerenciarAtas('admin', false), true);
    });

    it('morador inativo NÃO pode gerenciar atas', () => {
      assert.equal(podeGerenciarAtas('morador', false), false);
    });

    it('convidado externo NÃO pode gerenciar atas', () => {
      assert.equal(podeGerenciarAtas('externo', true), false);
      assert.equal(podeGerenciarAtas('externo', false), false);
    });

    it('usuário deslogado / anônimo NÃO pode gerenciar atas', () => {
      assert.equal(podeGerenciarAtas(null, null), false);
      assert.equal(podeGerenciarAtas(undefined, undefined), false);
    });

    it('apenas Administrador pode editar o Link do Drive da República', () => {
      assert.equal(podeEditarLinkDrive('admin', true), true);
      assert.equal(podeEditarLinkDrive('morador', true), false);
      assert.equal(podeEditarLinkDrive('externo', true), false);
      assert.equal(podeEditarLinkDrive(null, null), false);
    });
  });

  describe('6. Integridade das Políticas RLS no Script SQL (supabase/schema.sql)', () => {
    const schemaPath = path.resolve(__dirname, '../../supabase/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    it('deve habilitar Row Level Security em atas_reuniao e house_settings', () => {
      assert.ok(schemaSql.includes('ALTER TABLE public.atas_reuniao ENABLE ROW LEVEL SECURITY;'));
      assert.ok(schemaSql.includes('ALTER TABLE public.house_settings ENABLE ROW LEVEL SECURITY;'));
    });

    it('deve conceder leitura de atas para moradores ativos e admin', () => {
      assert.ok(schemaSql.includes('CREATE POLICY "Moradores ativos e admin leem atas"'));
      assert.ok(schemaSql.includes('ON public.atas_reuniao FOR SELECT'));
    });

    it('deve permitir que moradores ativos e admin publiquem, editem e excluam atas', () => {
      assert.ok(schemaSql.includes('CREATE POLICY "Moradores ativos e admin publicam atas"'));
      assert.ok(schemaSql.includes('CREATE POLICY "Moradores ativos e admin editam atas"'));
      assert.ok(schemaSql.includes('CREATE POLICY "Moradores ativos e admin excluem atas"'));
    });

    it('deve permitir leitura de house_settings para moradores ativos e admin', () => {
      assert.ok(schemaSql.includes('CREATE POLICY "Moradores ativos e admin leem house_settings"'));
      assert.ok(schemaSql.includes('ON public.house_settings FOR SELECT'));
    });

    it('deve restringir alteração de house_settings exclusivamente ao Administrador', () => {
      assert.ok(schemaSql.includes('CREATE POLICY "Apenas admin gerencia house_settings"'));
      assert.ok(schemaSql.includes('ON public.house_settings FOR ALL'));
      assert.ok(schemaSql.includes('USING (public.is_admin())'));
    });

    it('deve incluir atas_reuniao e house_settings na publicação supabase_realtime', () => {
      assert.ok(schemaSql.includes("'atas_reuniao'"));
      assert.ok(schemaSql.includes("'house_settings'"));
      assert.ok(schemaSql.includes('ALTER PUBLICATION supabase_realtime ADD TABLE'));
    });
  });
});
