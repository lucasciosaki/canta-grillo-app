import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGeracaoNumero,
  isVeteranoDe,
  isLiderDaFrente,
  isMembroDaFrente,
  verificarPermissaoAtribuicao,
  podeRemoverResponsavel,
  podeSolicitarTroca,
  podeAvancarStatusFunca,
  obterProximoStatusManual,
  obterApelidoMorador,
} from '../../src/types/funcas.ts';

describe('Unit Tests: Sistema Geral de Funças & Reunião Semanal', () => {
  // Mock de moradores para testes
  const adminUser = {
    id: 'user-admin',
    nome: 'Super Administrador',
    apelido: 'AdminRep',
    role: 'admin',
    ativo: true,
    geracao: '023',
  };

  const vetUser24 = {
    id: 'user-vet-24',
    nome: 'Rodrigo César',
    apelido: 'Cachorrão',
    role: 'morador',
    ativo: true,
    geracao: '024',
  };

  const bixoUser25 = {
    id: 'user-bixo-25',
    nome: 'Gabriel Ganso',
    apelido: 'Ganso',
    role: 'morador',
    ativo: true,
    geracao: '025',
  };

  const bixoUser26 = {
    id: 'user-bixo-26',
    nome: 'Felipe Novato',
    apelido: 'Bixo 026',
    role: 'morador',
    ativo: true,
    geracao: '026',
  };

  const inativoUser = {
    id: 'user-inativo',
    nome: 'Morador Desativado',
    apelido: 'Sumiu',
    role: 'morador',
    ativo: false,
    geracao: '025',
  };

  const externoUser = {
    id: 'user-externo',
    nome: 'Amigo Convidado',
    apelido: 'Agregado',
    role: 'externo',
    ativo: true,
    geracao: null,
  };

  const frenteIdManutencao = 'frente-manutencao-uuid';
  const frenteIdPiscina = 'frente-piscina-uuid';

  // Membros de frentes: Cachorrão é líder de manutenção; Ganso é membro de manutenção.
  const membrosFrentes = [
    { front_id: frenteIdManutencao, profile_id: vetUser24.id, is_lider: true },
    { front_id: frenteIdManutencao, profile_id: bixoUser25.id, is_lider: false },
    { front_id: frenteIdPiscina, profile_id: bixoUser26.id, is_lider: true },
  ];

  describe('1. Parsing de Geração e Relação Veterano -> Bixo', () => {
    it('deve extrair números inteiros de strings de geração', () => {
      assert.equal(parseGeracaoNumero('024'), 24);
      assert.equal(parseGeracaoNumero('025'), 25);
      assert.equal(parseGeracaoNumero('26'), 26);
      assert.equal(parseGeracaoNumero('G027'), 27);
      assert.equal(parseGeracaoNumero(null), null);
      assert.equal(parseGeracaoNumero('sem-numero'), null);
    });

    it('deve identificar veterania quando geracao_num(autor) < geracao_num(alvo)', () => {
      assert.equal(isVeteranoDe(vetUser24, bixoUser25), true);
      assert.equal(isVeteranoDe(vetUser24, bixoUser26), true);
      assert.equal(isVeteranoDe(bixoUser25, bixoUser26), true);
    });

    it('não deve considerar veterano se a geração for igual ou mais nova', () => {
      assert.equal(isVeteranoDe(bixoUser25, vetUser24), false);
      assert.equal(isVeteranoDe(bixoUser26, vetUser24), false);
      assert.equal(isVeteranoDe(bixoUser25, bixoUser25), false);
    });

    it('não deve considerar veterano se algum usuário for inativo ou externo', () => {
      assert.equal(isVeteranoDe(vetUser24, inativoUser), false);
      assert.equal(isVeteranoDe(vetUser24, externoUser), false);
    });
  });

  describe('2. Atribuição em Funça Geral (frente_id = null)', () => {
    it('veterano pode atribuir Funça Geral para bixo seu (veterano_bixo)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: vetUser24,
        alvo: bixoUser25,
        frenteId: null,
        membrosFrentes,
      });
      assert.equal(res.permitido, true);
      assert.equal(res.tipoAtribuicao, 'veterano_bixo');
    });

    it('qualquer morador ativo pode se autoatribuir Funça Geral (autoatribuicao)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: bixoUser26,
        alvo: bixoUser26,
        frenteId: null,
        membrosFrentes,
      });
      assert.equal(res.permitido, true);
      assert.equal(res.tipoAtribuicao, 'autoatribuicao');
    });

    it('bixo NÃO pode atribuir Funça Geral para veterano', () => {
      const res = verificarPermissaoAtribuicao({
        autor: bixoUser26,
        alvo: vetUser24,
        frenteId: null,
        membrosFrentes,
      });
      assert.equal(res.permitido, false);
      assert.equal(res.tipoAtribuicao, null);
    });

    it('Admin pode atribuir Funça Geral para qualquer morador ativo (admin_geral)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: adminUser,
        alvo: bixoUser26,
        frenteId: null,
        membrosFrentes,
      });
      assert.equal(res.permitido, true);
      assert.equal(res.tipoAtribuicao, 'admin_geral');
    });

    it('morador externo ou inativo NÃO pode receber atribuição', () => {
      const resExterno = verificarPermissaoAtribuicao({
        autor: adminUser,
        alvo: externoUser,
        frenteId: null,
        membrosFrentes,
      });
      assert.equal(resExterno.permitido, false);
      assert.equal(resExterno.motivo, 'Convidados externos não participam de funças');

      const resInativo = verificarPermissaoAtribuicao({
        autor: adminUser,
        alvo: inativoUser,
        frenteId: null,
        membrosFrentes,
      });
      assert.equal(resInativo.permitido, false);
      assert.equal(resInativo.motivo, 'Usuário inativo');
    });

    it('externo não pode receber atribuição nem mesmo no modo Reunião Semanal', () => {
      const res = verificarPermissaoAtribuicao({
        autor: adminUser,
        alvo: externoUser,
        frenteId: null,
        membrosFrentes,
        modoReuniao: true,
      });
      assert.equal(res.permitido, false);
      assert.equal(res.motivo, 'Convidados externos não participam de funças');
    });
  });

  describe('3. Atribuição em Funça de Frente (frente_id IS NOT NULL)', () => {
    it('líder da frente pode atribuir para integrante da mesma frente (lider_frente)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: vetUser24,
        alvo: bixoUser25,
        frenteId: frenteIdManutencao,
        membrosFrentes,
      });
      assert.equal(res.permitido, true);
      assert.equal(res.tipoAtribuicao, 'lider_frente');
    });

    it('líder da frente NÃO pode atribuir para quem não é membro da frente', () => {
      const res = verificarPermissaoAtribuicao({
        autor: vetUser24,
        alvo: bixoUser26, // bixoUser26 não é de manutenção
        frenteId: frenteIdManutencao,
        membrosFrentes,
      });
      assert.equal(res.permitido, false);
      assert.equal(res.tipoAtribuicao, null);
    });

    it('membro da frente pode se autoatribuir (autoatribuicao)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: bixoUser25,
        alvo: bixoUser25,
        frenteId: frenteIdManutencao,
        membrosFrentes,
      });
      assert.equal(res.permitido, true);
      assert.equal(res.tipoAtribuicao, 'autoatribuicao');
    });

    it('morador fora da frente NÃO pode se autoatribuir na funça da frente', () => {
      const res = verificarPermissaoAtribuicao({
        autor: bixoUser26,
        alvo: bixoUser26,
        frenteId: frenteIdManutencao,
        membrosFrentes,
      });
      assert.equal(res.permitido, false);
    });

    it('membro comum da frente NÃO pode atribuir para outro membro (apenas líder pode)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: bixoUser25,
        alvo: vetUser24,
        frenteId: frenteIdManutencao,
        membrosFrentes,
      });
      assert.equal(res.permitido, false);
    });

    it('Admin pode atribuir Funça de Frente para qualquer morador ativo (admin_geral)', () => {
      const res = verificarPermissaoAtribuicao({
        autor: adminUser,
        alvo: bixoUser26,
        frenteId: frenteIdManutencao,
        membrosFrentes,
      });
      assert.equal(res.permitido, true);
      assert.equal(res.tipoAtribuicao, 'admin_geral');
    });
  });

  describe('4. Modo Reunião Semanal (modoReuniao = true)', () => {
    it('qualquer morador ativo pode atribuir qualquer funça para qualquer morador com tipo "reuniao"', () => {
      const res1 = verificarPermissaoAtribuicao({
        autor: bixoUser26,
        alvo: vetUser24,
        frenteId: frenteIdManutencao,
        membrosFrentes,
        modoReuniao: true,
      });
      assert.equal(res1.permitido, true);
      assert.equal(res1.tipoAtribuicao, 'reuniao');

      const res2 = verificarPermissaoAtribuicao({
        autor: bixoUser25,
        alvo: bixoUser26,
        frenteId: null,
        membrosFrentes,
        modoReuniao: true,
      });
      assert.equal(res2.permitido, true);
      assert.equal(res2.tipoAtribuicao, 'reuniao');
    });
  });

  describe('5. Remoção de Responsável (podeRemoverResponsavel)', () => {
    const atribuicaoGanso = {
      morador_id: bixoUser25.id,
      morador: bixoUser25,
    };

    it('Admin pode remover responsável de qualquer funça', () => {
      assert.equal(
        podeRemoverResponsavel({
          usuario: adminUser,
          atribuicao: atribuicaoGanso,
          frenteId: null,
          membrosFrentes,
        }),
        true
      );
    });

    it('Líder da frente pode remover responsável de funça da sua frente', () => {
      assert.equal(
        podeRemoverResponsavel({
          usuario: vetUser24, // líder de manutenção
          atribuicao: atribuicaoGanso,
          frenteId: frenteIdManutencao,
          membrosFrentes,
        }),
        true
      );
    });

    it('Veterano do morador atribuído pode removê-lo INCLUSIVE em Funça de Frente', () => {
      // Cachorrão (024) é veterano de Ganso (025)
      assert.equal(
        podeRemoverResponsavel({
          usuario: vetUser24,
          atribuicao: atribuicaoGanso,
          frenteId: frenteIdPiscina, // mesmo que Cachorrão não seja líder de piscina!
          membrosFrentes,
        }),
        true
      );
    });

    it('O próprio responsável comum NÃO pode se desatribuir diretamente (deve pedir troca)', () => {
      assert.equal(
        podeRemoverResponsavel({
          usuario: bixoUser25,
          atribuicao: atribuicaoGanso,
          frenteId: null,
          membrosFrentes,
        }),
        false
      );
    });

    it('Bixo NÃO pode remover responsável veterano', () => {
      const atribuicaoCachorrao = {
        morador_id: vetUser24.id,
        morador: vetUser24,
      };
      assert.equal(
        podeRemoverResponsavel({
          usuario: bixoUser26,
          atribuicao: atribuicaoCachorrao,
          frenteId: null,
          membrosFrentes,
        }),
        false
      );
    });
  });

  describe('6. Solicitação de Troca entre Moradores (podeSolicitarTroca)', () => {
    const atribuicao = { morador_id: bixoUser25.id };

    it('responsável pode solicitar troca para qualquer morador ativo da casa', () => {
      assert.equal(
        podeSolicitarTroca({
          usuarioId: bixoUser25.id,
          atribuicao,
          alvo: bixoUser26,
          atribuicoesAtuaisIds: [bixoUser25.id],
        }),
        true
      );

      // Pode solicitar para veterano também
      assert.equal(
        podeSolicitarTroca({
          usuarioId: bixoUser25.id,
          atribuicao,
          alvo: vetUser24,
          atribuicoesAtuaisIds: [bixoUser25.id],
        }),
        true
      );
    });

    it('NÃO pode pedir troca para si mesmo', () => {
      assert.equal(
        podeSolicitarTroca({
          usuarioId: bixoUser25.id,
          atribuicao,
          alvo: bixoUser25,
          atribuicoesAtuaisIds: [bixoUser25.id],
        }),
        false
      );
    });

    it('NÃO pode pedir troca para quem já é co-responsável na mesma funça', () => {
      assert.equal(
        podeSolicitarTroca({
          usuarioId: bixoUser25.id,
          atribuicao,
          alvo: bixoUser26,
          atribuicoesAtuaisIds: [bixoUser25.id, bixoUser26.id],
        }),
        false
      );
    });

    it('NÃO pode pedir troca para morador inativo ou externo', () => {
      assert.equal(
        podeSolicitarTroca({
          usuarioId: bixoUser25.id,
          atribuicao,
          alvo: inativoUser,
          atribuicoesAtuaisIds: [bixoUser25.id],
        }),
        false
      );
      assert.equal(
        podeSolicitarTroca({
          usuarioId: bixoUser25.id,
          atribuicao,
          alvo: externoUser,
          atribuicoesAtuaisIds: [bixoUser25.id],
        }),
        false
      );
    });
  });

  describe('7. Ciclo de Vida Manual em 3 Etapas e Avanço de Status', () => {
    it('deve respeitar a transição aberta -> em_andamento -> concluida', () => {
      assert.equal(obterProximoStatusManual('aberta'), 'em_andamento');
      assert.equal(obterProximoStatusManual('em_andamento'), 'concluida');
      assert.equal(obterProximoStatusManual('concluida'), null);
    });

    it('responsável atribuído pode avançar status', () => {
      const funca = { relator_id: vetUser24.id, frente_id: null };
      const atribuicoes = [
        { morador_id: bixoUser25.id, atribuido_por: vetUser24.id, morador: bixoUser25 },
      ];

      assert.equal(
        podeAvancarStatusFunca({
          usuario: bixoUser25,
          funca,
          atribuicoes,
          membrosFrentes,
        }),
        true
      );
    });

    it('relator e Admin podem avançar status', () => {
      const funca = { relator_id: bixoUser26.id, frente_id: null };
      const atribuicoes = [];

      // Relator
      assert.equal(
        podeAvancarStatusFunca({
          usuario: bixoUser26,
          funca,
          atribuicoes,
          membrosFrentes,
        }),
        true
      );

      // Admin
      assert.equal(
        podeAvancarStatusFunca({
          usuario: adminUser,
          funca,
          atribuicoes,
          membrosFrentes,
        }),
        true
      );
    });

    it('morador sem relação com a funça NÃO pode avançar seu status', () => {
      const funca = { relator_id: vetUser24.id, frente_id: null };
      const atribuicoes = [
        { morador_id: bixoUser25.id, atribuido_por: vetUser24.id, morador: bixoUser25 },
      ];

      assert.equal(
        podeAvancarStatusFunca({
          usuario: bixoUser26, // não é relator, nem responsável, nem admin
          funca,
          atribuicoes,
          membrosFrentes,
        }),
        false
      );
    });
  });

  describe('8. Exibição Estrita de Apelido (obterApelidoMorador)', () => {
    it('deve priorizar sempre o apelido', () => {
      assert.equal(obterApelidoMorador({ nome: 'Rodrigo César', apelido: 'Cachorrão' }), 'Cachorrão');
      assert.equal(obterApelidoMorador({ nome: 'Gabriel Ganso', apelido: '  Ganso  ' }), 'Ganso');
    });

    it('deve usar o primeiro nome se o apelido for nulo ou vazio', () => {
      assert.equal(obterApelidoMorador({ nome: 'Felipe Novato', apelido: null }), 'Felipe');
      assert.equal(obterApelidoMorador({ nome: 'Felipe Novato', apelido: '   ' }), 'Felipe');
    });

    it('deve retornar "Morador" caso não haja nome nem apelido', () => {
      assert.equal(obterApelidoMorador(null), 'Morador');
      assert.equal(obterApelidoMorador({}), 'Morador');
    });
  });
});
