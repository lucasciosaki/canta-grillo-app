import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validarEdicaoMeuPerfil,
  podeAcessarGestaoMoradores,
  validarAcoesAdmin,
  validarEdicaoMoradorAdmin,
  validarEdicaoConvidadoAdmin,
  validarFotoPerfil,
  gerarNomeArquivoAvatar,
} from '../perfilLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unit Tests: Meu Perfil & Gestão de Moradores (Feature 3 - RN13)', () => {
  describe('1. Validação de Edição do Próprio Perfil (validarEdicaoMeuPerfil)', () => {
    it('deve permitir ao morador atualizar apelido, nome, quarto_id e avatar_url', () => {
      const perfilAtual = { role: 'morador' as const, geracao: '025' };
      const input = {
        apelido: ' Cachorrão ',
        nome: ' Rodrigo César Oliveira ',
        quarto_id: 'quarto-uuid-1',
        avatar_url: 'https://supabase.co/storage/v1/object/public/avatars/avatar_123.jpg',
      };

      const result = validarEdicaoMeuPerfil(input, perfilAtual);
      assert.equal(result.apelido, 'Cachorrão');
      assert.equal(result.nome, 'Rodrigo César Oliveira');
      assert.equal(result.quarto_id, 'quarto-uuid-1');
      assert.equal(result.avatar_url, 'https://supabase.co/storage/v1/object/public/avatars/avatar_123.jpg');
    });

    it('deve permitir remoção de foto de perfil (avatar_url = null)', () => {
      const perfilAtual = { role: 'morador' as const, geracao: '025' };
      const input = {
        apelido: 'Cachorrão',
        nome: 'Rodrigo',
        quarto_id: null,
        avatar_url: null,
      };

      const result = validarEdicaoMeuPerfil(input, perfilAtual);
      assert.equal(result.avatar_url, null);
    });

    it('deve rejeitar edição se o apelido for vazio ou contiver apenas espaços', () => {
      const perfilAtual = { role: 'morador' as const, geracao: '025' };
      assert.throws(
        () => validarEdicaoMeuPerfil({ apelido: '   ', nome: 'Rodrigo', quarto_id: null }, perfilAtual),
        /O apelido na república é obrigatório/
      );
    });

    it('deve rejeitar edição se o nome for vazio ou contiver apenas espaços', () => {
      const perfilAtual = { role: 'morador' as const, geracao: '025' };
      assert.throws(
        () => validarEdicaoMeuPerfil({ apelido: 'Cachorrão', nome: '', quarto_id: null }, perfilAtual),
        /O nome completo é obrigatório/
      );
    });

    it('morador comum NÃO deve conseguir alterar sua geração cadastrada', () => {
      const perfilAtual = { role: 'morador' as const, geracao: '025' };
      const input = {
        apelido: 'Cachorrão',
        nome: 'Rodrigo',
        quarto_id: null,
        geracao: '022', // Tentativa de se auto-tornar veterano
      };

      assert.throws(
        () => validarEdicaoMeuPerfil(input, perfilAtual),
        /Apenas administradores podem alterar a geração/
      );
    });

    it('morador comum informando a mesma geração cadastrada deve ser aceito sem erro', () => {
      const perfilAtual = { role: 'morador' as const, geracao: '025' };
      const input = {
        apelido: 'Cachorrão',
        nome: 'Rodrigo',
        quarto_id: null,
        geracao: '025',
      };

      const result = validarEdicaoMeuPerfil(input, perfilAtual);
      assert.equal(result.apelido, 'Cachorrão');
    });

    it('Administrador deve conseguir atualizar sua própria geração ou retificar no perfil', () => {
      const perfilAdmin = { role: 'admin' as const, geracao: '024' };
      const input = {
        apelido: 'Admin Chefe',
        nome: 'Chefe da Rep',
        quarto_id: 'quarto-uuid-2',
        geracao: ' 023 ',
      };

      const result = validarEdicaoMeuPerfil(input, perfilAdmin);
      assert.equal(result.geracao, '023');
    });
  });

  describe('2. Validação e Gerenciamento de Fotos de Perfil (validarFotoPerfil & gerarNomeArquivoAvatar)', () => {
    it('deve aceitar arquivo de imagem válido dentro do limite de 5MB', () => {
      assert.equal(validarFotoPerfil({ size: 1024 * 1024, type: 'image/jpeg' }), true);
      assert.equal(validarFotoPerfil({ size: 2 * 1024 * 1024, type: 'image/png' }), true);
      assert.equal(validarFotoPerfil({ size: 500 * 1024, type: 'image/webp' }), true);
    });

    it('deve rejeitar arquivos que não sejam imagens', () => {
      assert.throws(
        () => validarFotoPerfil({ size: 1024, type: 'application/pdf' }),
        /deve ser uma imagem válida/
      );
      assert.throws(
        () => validarFotoPerfil({ size: 1024, type: 'text/plain' }),
        /deve ser uma imagem válida/
      );
    });

    it('deve rejeitar fotos maiores que 5MB', () => {
      assert.throws(
        () => validarFotoPerfil({ size: 6 * 1024 * 1024, type: 'image/jpeg' }),
        /no máximo 5MB/
      );
    });

    it('deve gerar nome de arquivo com padrão avatar_{userId}_{timestamp}.jpg', () => {
      const fileName = gerarNomeArquivoAvatar('user-uuid-123', 1700000000000);
      assert.equal(fileName, 'avatar_user-uuid-123_1700000000000.jpg');
    });
  });

  describe('3. Acesso e Privilégios à Gestão de Moradores (podeAcessarGestaoMoradores)', () => {
    it('morador comum não tem acesso à gestão de moradores', () => {
      assert.equal(podeAcessarGestaoMoradores({ role: 'morador', ativo: true }), false);
    });

    it('admin inativo não tem acesso à gestão de moradores', () => {
      assert.equal(podeAcessarGestaoMoradores({ role: 'admin', ativo: false }), false);
    });

    it('convidado externo não tem acesso', () => {
      assert.equal(podeAcessarGestaoMoradores({ role: 'externo', ativo: true }), false);
    });

    it('admin ativo tem acesso liberado', () => {
      assert.equal(podeAcessarGestaoMoradores({ role: 'admin', ativo: true }), true);
    });
  });

  describe('4. Regras Administrativas e Proteção de Auto-Desativação/Rebaixamento (validarAcoesAdmin)', () => {
    const adminLogadoId = 'usr-admin-master';
    const outroMoradorId = 'usr-morador-comum';

    it('admin pode alterar dados e cargo de outro morador ativo', () => {
      const res = validarAcoesAdmin({
        adminLogadoId,
        alvoId: outroMoradorId,
        acao: 'editar',
        novoRole: 'admin',
      });
      assert.equal(res.permitido, true);
    });

    it('admin pode desativar o acesso de outro morador (ex-morador)', () => {
      const res = validarAcoesAdmin({
        adminLogadoId,
        alvoId: outroMoradorId,
        acao: 'desativar',
        novoAtivo: false,
      });
      assert.equal(res.permitido, true);
    });

    it('admin pode remover o cadastro de outro morador', () => {
      const res = validarAcoesAdmin({
        adminLogadoId,
        alvoId: outroMoradorId,
        acao: 'excluir',
      });
      assert.equal(res.permitido, true);
    });

    it('admin NÃO deve conseguir rebaixar seu próprio cargo para morador', () => {
      const res = validarAcoesAdmin({
        adminLogadoId,
        alvoId: adminLogadoId,
        acao: 'rebaixar',
        novoRole: 'morador',
      });
      assert.equal(res.permitido, false);
      assert.match(res.motivo || '', /não pode rebaixar seu próprio perfil/);
    });

    it('admin NÃO deve conseguir desativar seu próprio acesso (auto-desativação acidental)', () => {
      const res = validarAcoesAdmin({
        adminLogadoId,
        alvoId: adminLogadoId,
        acao: 'desativar',
        novoAtivo: false,
      });
      assert.equal(res.permitido, false);
      assert.match(res.motivo || '', /não pode desativar seu próprio acesso/);
    });

    it('admin NÃO deve conseguir excluir sua própria conta', () => {
      const res = validarAcoesAdmin({
        adminLogadoId,
        alvoId: adminLogadoId,
        acao: 'excluir',
      });
      assert.equal(res.permitido, false);
      assert.match(res.motivo || '', /não pode excluir sua própria conta/);
    });
  });

  describe('5. Validação de Payloads de Moradores e Convidados pelo Admin', () => {
    it('deve validar e formatar payload de morador ativo com avatar_url opcional', () => {
      const payload = validarEdicaoMoradorAdmin({
        apelido: ' Bixo Solto ',
        nome: ' Matheus Amaral ',
        geracao: ' 026 ',
        quarto_id: 'room-1',
        role: 'morador',
        avatar_url: 'https://exemplo.com/avatar.jpg',
      });

      assert.equal(payload.apelido, 'Bixo Solto');
      assert.equal(payload.nome, 'Matheus Amaral');
      assert.equal(payload.geracao, '026');
      assert.equal(payload.quarto_id, 'room-1');
      assert.equal(payload.role, 'morador');
      assert.equal(payload.avatar_url, 'https://exemplo.com/avatar.jpg');
    });

    it('deve rejeitar edição de morador com campos vazios ou role inválido', () => {
      assert.throws(
        () => validarEdicaoMoradorAdmin({ apelido: '', nome: 'A', geracao: '025', quarto_id: null, role: 'morador' }),
        /apelido do morador/
      );
      assert.throws(
        () => validarEdicaoMoradorAdmin({ apelido: 'A', nome: '', geracao: '025', quarto_id: null, role: 'morador' }),
        /nome do morador/
      );
      assert.throws(
        () => validarEdicaoMoradorAdmin({ apelido: 'A', nome: 'A', geracao: '', quarto_id: null, role: 'morador' }),
        /geração do morador/
      );
      assert.throws(
        () => validarEdicaoMoradorAdmin({ apelido: 'A', nome: 'A', geracao: '025', quarto_id: null, role: 'super' as any }),
        /Cargo \(role\) inválido/
      );
    });

    it('deve validar e formatar payload de convidado externo', () => {
      const payload = validarEdicaoConvidadoAdmin({
        apelido: ' Alemão ',
        nome: ' Convidado Silva ',
        telefone_contato: ' (19) 98888-7777 ',
      });

      assert.equal(payload.apelido, 'Alemão');
      assert.equal(payload.nome, 'Convidado Silva');
      assert.equal(payload.telefone_contato, '(19) 98888-7777');
    });

    it('deve rejeitar edição de convidado sem apelido ou sem telefone', () => {
      assert.throws(
        () => validarEdicaoConvidadoAdmin({ apelido: '', nome: 'A', telefone_contato: '19999' }),
        /apelido do convidado/
      );
      assert.throws(
        () => validarEdicaoConvidadoAdmin({ apelido: 'Alemão', nome: 'A', telefone_contato: '   ' }),
        /telefone\/WhatsApp do convidado/
      );
    });
  });

  describe('6. Verificação de Segurança no Schema SQL (protect_profile_roles & storage avatars)', () => {
    it('o arquivo supabase/schema.sql deve conter a blindagem da coluna geracao na função protect_profile_roles', () => {
      const schemaPath = path.resolve(__dirname, '../../../../supabase/schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

      // 1. Verifica presença da função protect_profile_roles
      assert.ok(
        schemaSql.includes('CREATE OR REPLACE FUNCTION public.protect_profile_roles()'),
        'Função protect_profile_roles deve existir no schema'
      );

      // 2. Verifica a blindagem específica de geracao
      assert.ok(
        schemaSql.includes('OLD.geracao IS NOT NULL AND NEW.geracao IS DISTINCT FROM OLD.geracao'),
        'protect_profile_roles deve verificar se NEW.geracao IS DISTINCT FROM OLD.geracao'
      );

      assert.ok(
        schemaSql.includes('Apenas administradores podem alterar a geração de um morador.'),
        'protect_profile_roles deve emitir mensagem clara sobre a proibição de alterar geração'
      );

      // 3. Verifica se o trigger trg_protect_profile_roles está configurado para UPDATE em profiles
      assert.ok(
        schemaSql.includes('CREATE TRIGGER trg_protect_profile_roles'),
        'Trigger trg_protect_profile_roles deve existir'
      );
      assert.ok(
        schemaSql.includes('BEFORE UPDATE ON public.profiles'),
        'Trigger deve executar BEFORE UPDATE ON public.profiles'
      );
    });

    it('o arquivo supabase/schema.sql deve conter o bucket de avatars e políticas RLS de storage', () => {
      const schemaPath = path.resolve(__dirname, '../../../../supabase/schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

      assert.ok(
        schemaSql.includes("INSERT INTO storage.buckets (id, name, public)\nVALUES ('avatars', 'avatars', true)"),
        'Bucket avatars deve ser criado'
      );
      assert.ok(
        schemaSql.includes('Avatars sao publicamente acessiveis'),
        'Política de SELECT público para avatars deve existir'
      );
      assert.ok(
        schemaSql.includes('Usuarios autenticados podem fazer upload do seu proprio avatar'),
        'Política de INSERT seguro para avatar deve existir'
      );
    });
  });
});
