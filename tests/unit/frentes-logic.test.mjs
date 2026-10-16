import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  obterApelidoFrente,
  filtrarFrentesVisiveis,
  verificarPermissaoFrente,
  filtrarFuncasPendentesDaFrente,
  podeAtribuirFuncaNaFrente,
  obterStatusChecklistDogsDia,
  agruparSolicitacoesMercadoPorItem,
  calcularRelatorioExternosMes,
  obterMesAnoAtual,
} from '../../src/types/frentes.ts';

describe('Unit Tests: Frentes Organizacionais & Chats (RN08, RN09, RN10, RN11, RN14)', () => {
  describe('1. Identificação Estrita por Apelido (obterApelidoFrente)', () => {
    it('deve priorizar apelido quando preenchido', () => {
      const perfil = { nome: 'Rodrigo César Oliveira', apelido: 'Cachorrão' };
      assert.equal(obterApelidoFrente(perfil), 'Cachorrão');
    });

    it('deve fazer fallback para nome se apelido for nulo, indefinido ou espaços vazios', () => {
      assert.equal(obterApelidoFrente({ nome: 'Gabriel Silva', apelido: null }), 'Gabriel Silva');
      assert.equal(obterApelidoFrente({ nome: 'Gabriel Silva', apelido: '   ' }), 'Gabriel Silva');
      assert.equal(obterApelidoFrente({ nome: 'Gabriel Silva' }), 'Gabriel Silva');
    });

    it('deve retornar "Morador" se perfil for nulo ou indefinido', () => {
      assert.equal(obterApelidoFrente(null), 'Morador');
      assert.equal(obterApelidoFrente(undefined), 'Morador');
      assert.equal(obterApelidoFrente({}), 'Morador');
    });
  });

  describe('2. Filtro de Frentes Visíveis por Participação (filtrarFrentesVisiveis)', () => {
    const frentes = [
      { id: 'f-piscina', nome: 'Piscina', slug: 'piscina', descricao: null },
      { id: 'f-jardim', nome: 'Jardim', slug: 'jardim', descricao: null },
      { id: 'f-dogs', nome: 'Dogs', slug: 'dogs', descricao: null },
      { id: 'f-mercado', nome: 'Mercado', slug: 'mercado', descricao: null },
      { id: 'f-financeiro', nome: 'Financeiro', slug: 'financeiro', descricao: null },
    ];

    const membros = [
      { front_id: 'f-piscina', profile_id: 'user-morador-1', is_lider: false, data_inicio: '2026-01-01' },
      { front_id: 'f-dogs', profile_id: 'user-morador-1', is_lider: true, data_inicio: '2026-01-01' },
      { front_id: 'f-mercado', profile_id: 'user-morador-2', is_lider: true, data_inicio: '2026-01-01' },
    ];

    it('morador comum deve visualizar exclusivamente as frentes em que participa', () => {
      const visiveis = filtrarFrentesVisiveis(frentes, membros, 'user-morador-1', false);
      assert.equal(visiveis.length, 2);
      assert.deepEqual(visiveis.map((f) => f.slug).sort(), ['dogs', 'piscina']);
    });

    it('morador sem frentes atribuídas deve receber array vazio', () => {
      const visiveis = filtrarFrentesVisiveis(frentes, membros, 'user-sem-frente', false);
      assert.equal(visiveis.length, 0);
    });

    it('administrador deve ter acesso a todas as frentes da casa', () => {
      const visiveis = filtrarFrentesVisiveis(frentes, membros, 'user-admin', true);
      assert.equal(visiveis.length, 5);
      assert.deepEqual(visiveis.map((f) => f.slug), ['piscina', 'jardim', 'dogs', 'mercado', 'financeiro']);
    });
  });

  describe('3. Verificação de Permissões de Acesso e Liderança (verificarPermissaoFrente)', () => {
    const membros = [
      { front_id: 'f-dogs', profile_id: 'user-lider', is_lider: true, data_inicio: '2026-01-01' },
      { front_id: 'f-dogs', profile_id: 'user-membro', is_lider: false, data_inicio: '2026-01-01' },
    ];

    it('membro líder deve ter podeAcessar=true, isMembro=true e isLider=true', () => {
      const perm = verificarPermissaoFrente('f-dogs', membros, 'user-lider', false);
      assert.deepEqual(perm, { podeAcessar: true, isMembro: true, isLider: true });
    });

    it('membro integrante deve ter podeAcessar=true, isMembro=true e isLider=false', () => {
      const perm = verificarPermissaoFrente('f-dogs', membros, 'user-membro', false);
      assert.deepEqual(perm, { podeAcessar: true, isMembro: true, isLider: false });
    });

    it('morador não participante tem podeAcessar=false', () => {
      const perm = verificarPermissaoFrente('f-dogs', membros, 'user-outro', false);
      assert.deepEqual(perm, { podeAcessar: false, isMembro: false, isLider: false });
    });

    it('admin mesmo sem estar em front_members tem podeAcessar=true', () => {
      const perm = verificarPermissaoFrente('f-dogs', membros, 'user-admin', true);
      assert.deepEqual(perm, { podeAcessar: true, isMembro: false, isLider: false });
    });
  });

  describe('4. Gestão e Atribuição de Funças da Frente (RN09)', () => {
    const funcas = [
      {
        id: 'funca-1',
        frente_id: 'f-manutencao',
        relator_id: 'u1',
        titulo: 'Trocar torneira da pia',
        descricao: 'Vazando água',
        foto_url: null,
        status: 'aberta',
        prazo: '2026-10-25',
        created_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'funca-2',
        frente_id: 'f-manutencao',
        relator_id: 'u2',
        titulo: 'Fixar suporte da TV',
        descricao: 'Parafuso frouxo',
        foto_url: null,
        status: 'em_andamento',
        prazo: '2026-10-20',
        created_at: '2026-10-12T10:00:00Z',
      },
      {
        id: 'funca-3',
        frente_id: 'f-manutencao',
        relator_id: 'u1',
        titulo: 'Pintar rodapé',
        descricao: 'Concluído',
        foto_url: null,
        status: 'concluida',
        prazo: null,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'funca-outra-frente',
        frente_id: 'f-piscina',
        relator_id: 'u1',
        titulo: 'Comprar cloro',
        descricao: '',
        foto_url: null,
        status: 'aberta',
        prazo: null,
        created_at: '2026-10-15T10:00:00Z',
      },
    ];

    it('deve filtrar apenas funças pendentes (aberta ou em_andamento) daquela frente específica', () => {
      const pendentes = filtrarFuncasPendentesDaFrente(funcas, 'f-manutencao');
      assert.equal(pendentes.length, 2);
      // 'em_andamento' deve estar no topo
      assert.equal(pendentes[0].id, 'funca-2');
      assert.equal(pendentes[1].id, 'funca-1');
    });

    it('regras de permissão de atribuição', () => {
      // Autoatribuição de membro
      const autoMembro = podeAtribuirFuncaNaFrente({
        isAdmin: false,
        isLiderDaFrente: false,
        isMembroDaFrente: true,
        autorId: 'u-membro',
        alvoMoradorId: 'u-membro',
      });
      assert.deepEqual(autoMembro, { permitido: true, tipoAtribuicao: 'autoatribuicao' });

      // Membro tentando atribuir para outro colega (bloqueado)
      const membroTentandoAtribuir = podeAtribuirFuncaNaFrente({
        isAdmin: false,
        isLiderDaFrente: false,
        isMembroDaFrente: true,
        autorId: 'u-membro',
        alvoMoradorId: 'u-colega',
      });
      assert.deepEqual(membroTentandoAtribuir, { permitido: false, tipoAtribuicao: null });

      // Líder atribuindo para integrante da frente
      const liderAtribuindo = podeAtribuirFuncaNaFrente({
        isAdmin: false,
        isLiderDaFrente: true,
        isMembroDaFrente: true,
        autorId: 'u-lider',
        alvoMoradorId: 'u-colega',
      });
      assert.deepEqual(liderAtribuindo, { permitido: true, tipoAtribuicao: 'lider_frente' });

      // Admin geral atribuindo
      const adminAtribuindo = podeAtribuirFuncaNaFrente({
        isAdmin: true,
        isLiderDaFrente: false,
        isMembroDaFrente: false,
        autorId: 'u-admin',
        alvoMoradorId: 'u-qualquer',
      });
      assert.deepEqual(adminAtribuindo, { permitido: true, tipoAtribuicao: 'admin_geral' });
    });
  });

  describe('5. Checklist Diário dos Dogs (RN10 - Manhã e Noite)', () => {
    it('deve identificar turnos cumpridos e verificar se o dia está completo', () => {
      const semNada = [];
      const resVazio = obterStatusChecklistDogsDia(semNada);
      assert.equal(resVazio.manha, null);
      assert.equal(resVazio.noite, null);
      assert.equal(resVazio.completo, false);

      const apenasManha = [
        {
          id: 'dog-1',
          data: '2026-10-16',
          turno: 'manha',
          alimentado_por: 'u1',
          horario_alimentacao: '2026-10-16T08:30:00Z',
          observacoes: 'Ração + sachê',
        },
      ];
      const resManha = obterStatusChecklistDogsDia(apenasManha);
      assert.ok(resManha.manha);
      assert.equal(resManha.noite, null);
      assert.equal(resManha.completo, false);

      const diaCompleto = [
        ...apenasManha,
        {
          id: 'dog-2',
          data: '2026-10-16',
          turno: 'noite',
          alimentado_por: 'u2',
          horario_alimentacao: '2026-10-16T19:45:00Z',
          observacoes: null,
        },
      ];
      const resCompleto = obterStatusChecklistDogsDia(diaCompleto);
      assert.ok(resCompleto.manha);
      assert.ok(resCompleto.noite);
      assert.equal(resCompleto.completo, true);
    });
  });

  describe('6. Agrupamento de Solicitações do Mercado (RN08)', () => {
    const catalogo = [
      { id: 'cat-1', nome: 'Detergente Neutro', categoria: 'Limpeza', unidade_medida: 'frasco', is_ativo: true },
      { id: 'cat-2', nome: 'Café em Pó 500g', categoria: 'Alimentos', unidade_medida: 'pacote', is_ativo: true },
      { id: 'cat-3', nome: 'Papel Higiênico', categoria: 'Higiene', unidade_medida: 'fardo', is_ativo: true },
    ];

    const solicitacoes = [
      {
        item_id: 'cat-1',
        mes_ano_ciclo: '2026-10',
        solicitado_por: 'u1',
        status: 'solicitado',
        data_solicitacao: '2026-10-05T10:00:00Z',
        solicitante: { id: 'u1', nome: 'Rodrigo César', apelido: 'Cachorrão' },
      },
      {
        item_id: 'cat-1',
        mes_ano_ciclo: '2026-10',
        solicitado_por: 'u2',
        status: 'solicitado',
        data_solicitacao: '2026-10-06T10:00:00Z',
        solicitante: { id: 'u2', nome: 'Lucas Santos', apelido: 'Ganso' },
      },
      {
        item_id: 'cat-2',
        mes_ano_ciclo: '2026-10',
        solicitado_por: 'u3',
        status: 'comprado',
        data_solicitacao: '2026-10-01T10:00:00Z',
        solicitante: { id: 'u3', nome: 'Felipe Bixo', apelido: null },
      },
    ];

    it('deve agrupar múltiplos pedidos para o mesmo item e identificar solicitantes', () => {
      const agrupados = agruparSolicitacoesMercadoPorItem(solicitacoes, catalogo);
      assert.equal(agrupados.length, 2);

      const grupoDetergente = agrupados.find((g) => g.item.id === 'cat-1');
      assert.ok(grupoDetergente);
      assert.equal(grupoDetergente.todosComprados, false);
      assert.deepEqual(grupoDetergente.solicitantesApelidos.sort(), ['Cachorrão', 'Ganso']);

      const grupoCafe = agrupados.find((g) => g.item.id === 'cat-2');
      assert.ok(grupoCafe);
      assert.equal(grupoCafe.todosComprados, true);
      assert.deepEqual(grupoCafe.solicitantesApelidos, ['Felipe Bixo']);
    });
  });

  describe('7. Relatório Mensal de Refeições de Convidados Externos (RN02)', () => {
    const externos = [
      { id: 'ext-1', nome: 'Beatriz Amiga', apelido: 'Bia Externa', telefone_contato: '11999999999', role: 'externo' },
      { id: 'ext-2', nome: 'Carlos Namorado', apelido: 'Carlinhos', telefone_contato: null, role: 'externo' },
      { id: 'ext-3', nome: 'Zeca Nunca Veio', apelido: 'Zeca', telefone_contato: null, role: 'externo' },
      { id: 'morador-x', nome: 'Morador Casa', apelido: 'Morador', telefone_contato: null, role: 'morador' },
    ];

    const refeicoes = [
      { usuario_id: 'ext-1', data: '2026-10-02', misturas_consumidas: 1.0 },
      { usuario_id: 'ext-1', data: '2026-10-05', misturas_consumidas: 1.0 },
      { usuario_id: 'ext-1', data: '2026-10-12', misturas_consumidas: 1.0 },
      // Registro de outro mês não deve entrar
      { usuario_id: 'ext-1', data: '2026-09-28', misturas_consumidas: 1.0 },
      // Registro com 0 misturas não entra
      { usuario_id: 'ext-1', data: '2026-10-15', misturas_consumidas: 0.0 },

      { usuario_id: 'ext-2', data: '2026-10-10', misturas_consumidas: 1.0 },
      // Refeição de morador comum não entra no relatório da caixinha
      { usuario_id: 'morador-x', data: '2026-10-02', misturas_consumidas: 1.0 },
    ];

    it('deve consolidar apenas refeições de convidados externos do mês selecionado', () => {
      const relatorio = calcularRelatorioExternosMes(externos, refeicoes, '2026-10');
      assert.equal(relatorio.length, 2);

      // Primeiro lugar: Bia Externa com 3 refeições
      assert.equal(relatorio[0].convidado_id, 'ext-1');
      assert.equal(relatorio[0].apelido, 'Bia Externa');
      assert.equal(relatorio[0].total_refeicoes, 3);
      assert.deepEqual(relatorio[0].datas_consumo, ['2026-10-02', '2026-10-05', '2026-10-12']);

      // Segundo lugar: Carlinhos com 1 refeição
      assert.equal(relatorio[1].convidado_id, 'ext-2');
      assert.equal(relatorio[1].apelido, 'Carlinhos');
      assert.equal(relatorio[1].total_refeicoes, 1);
    });

    it('deve formatar o ciclo mês/ano corretamente com obterMesAnoAtual', () => {
      const date = new Date(2026, 9, 16); // Outubro = mês index 9
      assert.equal(obterMesAnoAtual(date), '2026-10');
    });
  });
});
