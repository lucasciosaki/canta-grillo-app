import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBrasiliaDateParts,
  shouldNotifyPontoExpiring1h,
  shouldNotifyFaxina01h,
  shouldNotifyHalls11h,
  shouldNotifyMisturas15hOr21h,
  shouldNotifyDogs11hOr21h,
  checkPrazoFunca,
  formatNotificationRelativeTime,
  deriveNotifications,
} from '../../src/types/notificacoes.ts';
import {
  hasBeenPushed,
  markAsPushed,
  clearPushedEvents,
} from '../../src/utils/browserPush.ts';

describe('Unit Tests: Central de Notificações Completa & 20 Gatilhos Oficiais', () => {
  const baseUserId = 'user-morador-1';
  const baseUser = {
    id: baseUserId,
    nome: 'Morador Teste',
    apelido: 'Teste',
    role: 'morador',
    ativo: true,
    quarto_id: 'quarto-1',
  };

  // Mock de data base no meio de um dia qualquer (14:00 BRT = 17:00 UTC)
  // 2026-10-15T17:00:00.000Z em America/Sao_Paulo é 15/10/2026 14:00:00
  const baseAgora = new Date('2026-10-15T17:00:00.000Z');

  describe('Funções Auxiliares de Fuso e Horários de Brasília', () => {
    it('deve extrair ano, mês, dia, hora e minuto corretos no fuso America/Sao_Paulo', () => {
      // 17:00 UTC = 14:00 BRT
      const parts = getBrasiliaDateParts(baseAgora);
      assert.equal(parts.year, 2026);
      assert.equal(parts.month, 10);
      assert.equal(parts.day, 15);
      assert.equal(parts.hour, 14);
      assert.equal(parts.minute, 0);
      assert.equal(parts.dateStr, '2026-10-15');
    });

    it('deve calcular tempo relativo amigável de notificações', () => {
      const agora = new Date('2026-10-15T17:00:00.000Z');
      const mesmoMinuto = new Date(agora.getTime() - 20 * 1000).toISOString();
      assert.equal(formatNotificationRelativeTime(mesmoMinuto, agora), 'Agora');

      const dezMinAtras = new Date(agora.getTime() - 10 * 60 * 1000).toISOString();
      assert.equal(formatNotificationRelativeTime(dezMinAtras, agora), 'Há 10 min');

      const duasHorasAtras = new Date(agora.getTime() - 2 * 3600 * 1000).toISOString();
      assert.equal(formatNotificationRelativeTime(duasHorasAtras, agora), 'Há 2h');
    });
  });

  describe('Deduplicação do Browser Push (localStorage)', () => {
    beforeEach(() => {
      clearPushedEvents();
    });

    it('deve registrar e verificar se um ID já foi notificado', () => {
      assert.equal(hasBeenPushed('evento-123'), false);
      markAsPushed('evento-123');
      assert.equal(hasBeenPushed('evento-123'), true);
    });

    it('deve limpar histórico quando solicitado', () => {
      markAsPushed('evento-abc');
      assert.equal(hasBeenPushed('evento-abc'), true);
      clearPushedEvents();
      assert.equal(hasBeenPushed('evento-abc'), false);
    });
  });

  describe('G1: Novo Ponto de Bagunça Aberto', () => {
    it('deve gerar notificação não lida para morador quando outro usuário abre ponto', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosBagunca: [
          {
            id: 'ponto-1',
            relator_id: 'outro-user',
            local_descricao: 'Prato sujo na pia',
            status: 'aberta',
            created_at: '2026-10-15T16:30:00.000Z',
          },
        ],
        visualizacoesIds: new Set(),
      });

      assert.equal(notifs.length, 1);
      assert.equal(notifs[0].id, 'ponto-novo-ponto-1');
      assert.equal(notifs[0].category, 'ponto_bagunca');
      assert.equal(notifs[0].targetScreen, 'home');
      assert.equal(notifs[0].read, false);
      assert.ok(notifs[0].message.includes('Prato sujo na pia'));
    });

    it('deve marcar como lida automaticamente se o morador já abriu a foto (visualizou)', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosBagunca: [
          {
            id: 'ponto-1',
            relator_id: 'outro-user',
            local_descricao: 'Copo na sala',
            status: 'aberta',
            created_at: '2026-10-15T16:30:00.000Z',
          },
        ],
        visualizacoesIds: new Set(['ponto-1']),
      });

      assert.equal(notifs.length, 1);
      assert.equal(notifs[0].read, true);
    });

    it('não deve notificar o próprio relator que criou o ponto', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosBagunca: [
          {
            id: 'ponto-proprio',
            relator_id: baseUserId,
            local_descricao: 'Minha denúncia',
            status: 'aberta',
            created_at: '2026-10-15T16:30:00.000Z',
          },
        ],
      });

      assert.equal(notifs.length, 0);
    });
  });

  describe('G2: Urgência — Ponto de Bagunça a <= 1h de Expirar', () => {
    it('deve identificar ponto faltando 45 minutos para completar 24h', () => {
      // Criado há 23 horas e 15 minutos em relação a baseAgora
      const criacao = new Date(baseAgora.getTime() - (23 * 60 + 15) * 60 * 1000).toISOString();
      const res = shouldNotifyPontoExpiring1h(criacao, baseAgora);
      assert.equal(res.shouldNotify, true);
      assert.equal(res.minutesRemaining, 45);

      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosBagunca: [
          {
            id: 'ponto-urgente',
            relator_id: 'outro-user',
            local_descricao: 'Panela queimada',
            status: 'aberta',
            created_at: criacao,
          },
        ],
        visualizacoesIds: new Set(),
      });

      const urgente = notifs.find((n) => n.id === 'ponto-expiring-1h-ponto-urgente');
      assert.ok(urgente);
      assert.equal(urgente.urgency, 'urgent');
      assert.equal(urgente.targetScreen, 'home');
    });

    it('não deve disparar urgência se morador já visualizou a foto', () => {
      const criacao = new Date(baseAgora.getTime() - (23 * 60 + 15) * 60 * 1000).toISOString();
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosBagunca: [
          {
            id: 'ponto-urgente',
            relator_id: 'outro-user',
            local_descricao: 'Panela queimada',
            status: 'aberta',
            created_at: criacao,
          },
        ],
        visualizacoesIds: new Set(['ponto-urgente']),
      });

      const urgente = notifs.find((n) => n.id === 'ponto-expiring-1h-ponto-urgente');
      assert.equal(urgente, undefined);
    });
  });

  describe('G3: Ponto Individual Creditado ao Morador', () => {
    it('deve notificar lançamento de ponto creditado e contagem no mês', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosIndividuaisCreditados: [
          {
            id: 'ponto-meu-1',
            local_descricao: 'Resto de comida na mesa',
            totalPontosMes: 3,
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'ponto-creditado-ponto-meu-1');
      assert.ok(notif);
      assert.ok(notif.message.includes('3/7 pontos'));
      assert.equal(notif.targetScreen, 'home');
    });
  });

  describe('G4: Ponto de Falta Lançado no Quadro de Faxina', () => {
    it('deve gerar notificação urgente com total de faltas da semana', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosFaltaRecebidos: [
          {
            id: 'falta-sem-42',
            motivo: 'Foto não enviada até as 01h',
            totalFaltasSemana: 2,
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'quadro-falta-falta-sem-42');
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
      assert.equal(notif.targetScreen, 'quadro');
      assert.ok(notif.message.includes('Total na semana: 2 ponto(s)'));
    });
  });

  describe('G5: Urgência — Foto da Faxina a <= 1h do Corte das 01:00 BRT', () => {
    it('deve acionar na janela 00:00–00:59 BRT se o quarto estiver escalado e sem foto', () => {
      // 00:30 BRT = 03:30 UTC
      const data0030 = new Date('2026-10-15T03:30:00.000Z');
      const check = shouldNotifyFaxina01h(data0030, {
        isEscaladoHoje: true,
        jaEnviouFotoHoje: false,
      });
      assert.equal(check.shouldNotify, true);

      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: data0030,
        escalasQuarto: {
          semana_ano: 42,
          pontos_faltas: 0,
          area_nome: 'Cozinha',
          isEscaladoHoje: true,
          jaEnviouFotoHoje: false,
        },
      });

      const notif = notifs.find((n) => n.id.startsWith('faxina-corte-01h-'));
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
      assert.equal(notif.targetScreen, 'quadro');
    });

    it('não deve acionar fora da janela das 00:00 BRT', () => {
      // 23:30 BRT = 02:30 UTC
      const data2330 = new Date('2026-10-15T02:30:00.000Z');
      const check = shouldNotifyFaxina01h(data2330, {
        isEscaladoHoje: true,
        jaEnviouFotoHoje: false,
      });
      assert.equal(check.shouldNotify, false);
    });
  });

  describe('G6: Nova Foto Enviada para o Fiscal Avaliar', () => {
    it('deve notificar o quarto fiscal (Halls) quando outro quarto envia foto', () => {
      const userFiscal = { ...baseUser, quarto_id: 'quarto-halls' };
      const notifs = deriveNotifications({
        currentUser: userFiscal,
        agora: baseAgora,
        quartoFiscalId: 'quarto-halls',
        novasFotosFiscalHoje: [
          {
            id: 'foto-101',
            quarto_nome: 'Quarto 03',
            area_nome: 'Externo',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'fiscal-foto-nova-foto-101');
      assert.ok(notif);
      assert.ok(notif.message.includes('Quarto 03'));
      assert.equal(notif.targetScreen, 'quadro');
    });

    it('não deve notificar morador que não é do quarto fiscal (inclusive Administrador)', () => {
      const adminNaoFiscal = { ...baseUser, role: 'admin', quarto_id: 'quarto-1' };
      const notifs = deriveNotifications({
        currentUser: adminNaoFiscal,
        agora: baseAgora,
        quartoFiscalId: 'quarto-halls',
        novasFotosFiscalHoje: [
          {
            id: 'foto-101',
            quarto_nome: 'Quarto 03',
            area_nome: 'Externo',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'fiscal-foto-nova-foto-101');
      assert.equal(notif, undefined);
    });
  });

  describe('G7: Urgência — Fiscalização do Halls a <= 1h do Corte das 11:00 BRT', () => {
    it('deve acionar na janela 10:00–10:59 BRT se o Halls tiver fotos pendentes de ontem', () => {
      // 10:30 BRT = 13:30 UTC
      const data1030 = new Date('2026-10-15T13:30:00.000Z');
      const check = shouldNotifyHalls11h(data1030, {
        isFiscal: true,
        temFotosPendentesOntem: true,
      });
      assert.equal(check.shouldNotify, true);

      const userFiscal = { ...baseUser, quarto_id: 'quarto-halls' };
      const notifs = deriveNotifications({
        currentUser: userFiscal,
        agora: data1030,
        quartoFiscalId: 'quarto-halls',
        tarefasFiscalPendenteOntem: [{ id: 'tarefa-ontem' }],
      });

      const notif = notifs.find((n) => n.id.startsWith('halls-corte-11h-'));
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
      assert.equal(notif.targetScreen, 'quadro');
    });

    it('NÃO deve notificar Administrador se seu quarto não for o fiscal da semana', () => {
      const data1030 = new Date('2026-10-15T13:30:00.000Z');
      const adminNaoFiscal = { ...baseUser, role: 'admin', quarto_id: 'quarto-1' };
      const notifs = deriveNotifications({
        currentUser: adminNaoFiscal,
        agora: data1030,
        quartoFiscalId: 'quarto-halls',
        tarefasFiscalPendenteOntem: [{ id: 'tarefa-ontem' }],
      });

      const notif = notifs.find((n) => n.id.startsWith('halls-corte-11h-'));
      assert.equal(notif, undefined);
    });
  });


  describe('G8: Nova Mensagem nos Chats das Frentes', () => {
    it('deve notificar integrantes da frente quando outro membro envia mensagem', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-financeiro']),
        frontsMap: {
          'frente-financeiro': { id: 'frente-financeiro', nome: 'Financeiro', slug: 'caixinha' },
        },
        mensagensFrente: [
          {
            id: 'msg-1',
            frente_id: 'frente-financeiro',
            autor_id: 'outro-autor',
            conteudo: 'Boleto de água disponível!',
            enviada_em: '2026-10-15T16:00:00.000Z',
            autor_apelido: 'Tesoureiro',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'chat-frente-msg-1');
      assert.ok(notif);
      assert.equal(notif.title, '💬 Financeiro');
      assert.ok(notif.message.includes('Tesoureiro: Boleto de água disponível!'));
      assert.equal(notif.targetScreen, 'frentes');
    });

    it('não deve notificar morador se a frente não fizer parte de suas frentes', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-dogs']),
        mensagensFrente: [
          {
            id: 'msg-outra',
            frente_id: 'frente-piscina',
            autor_id: 'outro-autor',
            conteudo: 'Cloro adicionado',
            enviada_em: '2026-10-15T16:00:00.000Z',
          },
        ],
      });

      assert.equal(notifs.length, 0);
    });
  });

  describe('G9: Nova Mensagem no Chat de Ponto de Bagunça Aberto', () => {
    it('deve notificar nova mensagem na discussão do ponto', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pontosMensagens: [
          {
            id: 'msg-ponto-1',
            ponto_bagunca_id: 'ponto-123',
            autor_id: 'outro-morador',
            conteudo: 'Esse copo é meu, já estou recolhendo!',
            enviada_em: '2026-10-15T16:50:00.000Z',
            autor_apelido: 'Culpado',
            ponto_local_descricao: 'Copo na sala',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'chat-ponto-msg-ponto-1');
      assert.ok(notif);
      assert.equal(notif.targetScreen, 'home');
      assert.ok(notif.message.includes('Culpado: Esse copo é meu'));
    });
  });

  describe('G10: Alocação em Frente ou Promoção a Líder', () => {
    it('deve notificar quando morador é adicionado ou nomeado líder', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        alocacoesFrente: [
          {
            front_id: 'front-jardim',
            frente_nome: 'Jardim',
            is_lider: true,
            data_inicio: '2026-10-15T12:00:00.000Z',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'frente-aloc-front-jardim-lider');
      assert.ok(notif);
      assert.ok(notif.message.includes('nomeado Líder da frente Jardim'));
      assert.equal(notif.targetScreen, 'frentes');
    });
  });

  describe('G11: Funça Atribuída a Você', () => {
    it('deve notificar nova atribuição de funça', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        minhasFuncasAtribuidas: [
          {
            id: 'funca-1',
            titulo: 'Consertar trinco do portão',
            status: 'aberta',
            prazo: '2026-10-20',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'funca-atribuida-funca-1');
      assert.ok(notif);
      assert.ok(notif.message.includes('Consertar trinco do portão'));
      assert.equal(notif.targetScreen, 'funcas');
    });
  });

  describe('G12: Nova Funça Aberta na Sua Frente', () => {
    it('deve notificar nova funça aberta na frente do morador', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-manutencao']),
        novasFuncasNaMinhaFrente: [
          {
            id: 'funca-frente-1',
            frente_id: 'frente-manutencao',
            frente_nome: 'Manutenção',
            titulo: 'Trocar lâmpada do corredor',
            relator_id: 'outro-morador',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'funca-nova-frente-funca-frente-1');
      assert.ok(notif);
      assert.equal(notif.title, '🛠️ Nova funça em Manutenção');
      assert.equal(notif.targetScreen, 'funcas');
    });
  });

  describe('G13: Lembrete de Prazo de Funça (Vence Hoje ou Atrasada)', () => {
    it('deve verificar status de prazos com checkPrazoFunca', () => {
      assert.equal(checkPrazoFunca('2026-10-14', '2026-10-15'), 'atrasada');
      assert.equal(checkPrazoFunca('2026-10-15', '2026-10-15'), 'hoje');
      assert.equal(checkPrazoFunca('2026-10-16', '2026-10-15'), 'futura');
    });

    it('deve gerar notificação urgente para funça vencendo hoje ou atrasada', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora, // 2026-10-15
        minhasFuncasAtribuidas: [
          {
            id: 'funca-hoje',
            titulo: 'Limpar geladeira da despensa',
            status: 'aberta',
            prazo: '2026-10-15',
          },
          {
            id: 'funca-atrasada',
            titulo: 'Recolher lixo reciclável',
            status: 'em_andamento',
            prazo: '2026-10-14',
          },
        ],
      });

      const notifHoje = notifs.find((n) => n.id.includes('funca-prazo-hoje-funca-hoje'));
      assert.ok(notifHoje);
      assert.equal(notifHoje.urgency, 'urgent');

      const notifAtrasada = notifs.find((n) => n.id.includes('funca-prazo-atrasada-funca-atrasada'));
      assert.ok(notifAtrasada);
      assert.equal(notifAtrasada.urgency, 'urgent');
    });
  });

  describe('G14: Pedido de Troca de Funça Recebido', () => {
    it('deve gerar notificação urgente para pedido de troca direcionado ao usuário', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        pedidosTrocaRecebidos: [
          {
            funca_id: 'funca-99',
            titulo: 'Organizar despensa',
            solicitante_apelido: 'Bixo 026',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'funca-troca-recebida-funca-99');
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
      assert.equal(notif.targetScreen, 'funcas');
      assert.ok(notif.message.includes('Bixo 026'));
    });
  });

  describe('G15: Resposta ao Pedido de Troca de Funça', () => {
    it('deve notificar quando o pedido de troca for aceito ou recusado', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        respostasTroca: [
          { funca_id: 'f1', titulo: 'Comprar lâmpada', aceito: true },
          { funca_id: 'f2', titulo: 'Varrer quintal', aceito: false },
        ],
      });

      const aceito = notifs.find((n) => n.id === 'funca-troca-resp-f1-aceito');
      assert.ok(aceito);
      assert.equal(aceito.title, '✅ Troca de Funça Aceita');

      const recusado = notifs.find((n) => n.id === 'funca-troca-resp-f2-recusado');
      assert.ok(recusado);
      assert.equal(recusado.title, '❌ Troca de Funça Recusada');
    });
  });

  describe('G16: Frente Mercado — Solicitação de Item Faltante', () => {
    it('deve notificar integrantes do Mercado quando novo item for solicitado', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-mercado']),
        frontsMap: {
          'frente-mercado': { id: 'frente-mercado', nome: 'Mercado', slug: 'mercado' },
        },
        solicitacoesMercado: [
          {
            id: 'solic-cafe',
            item_nome: 'Café Tradicional 500g',
            solicitante_apelido: 'Veterano',
            solicitado_por: 'outro-user',
          },
        ],
      });

      const notif = notifs.find((n) => n.id === 'mercado-solic-solic-cafe');
      assert.ok(notif);
      assert.equal(notif.title, '🛒 Frente Mercado');
      assert.equal(notif.targetScreen, 'frentes');
      assert.ok(notif.message.includes('Café Tradicional 500g'));
    });

    it('NÃO deve notificar morador comum que não faz parte da frente Mercado', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-piscina']), // Usuário está em outra frente
        frontsMap: {
          'frente-mercado': { id: 'frente-mercado', nome: 'Mercado', slug: 'mercado' },
          'frente-piscina': { id: 'frente-piscina', nome: 'Piscina', slug: 'piscina' },
        },
        solicitacoesMercado: [
          {
            id: 'solic-cafe',
            item_nome: 'Café Tradicional 500g',
            solicitante_apelido: 'Veterano',
            solicitado_por: 'outro-user',
          },
        ],
      });

      assert.equal(notifs.some((n) => n.category === 'mercado'), false);
    });

    it('NÃO deve notificar o próprio morador que solicitou o item', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-mercado']),
        frontsMap: {
          'frente-mercado': { id: 'frente-mercado', nome: 'Mercado', slug: 'mercado' },
        },
        solicitacoesMercado: [
          {
            id: 'solic-cafe',
            item_nome: 'Café Tradicional 500g',
            solicitante_apelido: 'Teste',
            solicitado_por: baseUserId, // O próprio usuário
          },
        ],
      });

      assert.equal(notifs.some((n) => n.category === 'mercado'), false);
    });

    it('NÃO deve notificar Administrador se ele não for membro da frente Mercado', () => {
      const adminUser = { ...baseUser, role: 'admin' };
      const notifs = deriveNotifications({
        currentUser: adminUser,
        agora: baseAgora,
        userFrontIds: new Set(['frente-financeiro']), // Admin não está no Mercado
        frontsMap: {
          'frente-mercado': { id: 'frente-mercado', nome: 'Mercado', slug: 'mercado' },
          'frente-financeiro': { id: 'frente-financeiro', nome: 'Financeiro', slug: 'caixinha' },
        },
        solicitacoesMercado: [
          {
            id: 'solic-cafe',
            item_nome: 'Café Tradicional 500g',
            solicitante_apelido: 'Veterano',
            solicitado_por: 'outro-user',
          },
        ],
      });

      assert.equal(notifs.some((n) => n.category === 'mercado'), false);
    });
  });



  describe('G17: Frente Dogs — Refeição Pendente às 11:00h e 21:00h BRT', () => {
    it('deve acionar às 11:00h se refeição da manhã estiver pendente', () => {
      // 11:30 BRT = 14:30 UTC
      const data1130 = new Date('2026-10-15T14:30:00.000Z');
      const check = shouldNotifyDogs11hOr21h(data1130, {
        isMemberOrAdmin: true,
        refeicaoManhaFeita: false,
        refeicaoNoiteFeita: false,
      });
      assert.equal(check.shouldNotify, true);
      assert.equal(check.window, 'manha');

      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: data1130,
        userFrontIds: new Set(['front-dogs']),
        frontsMap: { 'front-dogs': { id: 'front-dogs', nome: 'Dogs', slug: 'dogs' } },
        dogsRefeicaoManhaHojeFeita: false,
      });

      const notif = notifs.find((n) => n.id.startsWith('dogs-manha-'));
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
      assert.equal(notif.targetScreen, 'frentes');
    });

    it('NÃO deve notificar Administrador se ele não for membro da frente Dogs', () => {
      const data1130 = new Date('2026-10-15T14:30:00.000Z');
      const adminUser = { ...baseUser, role: 'admin' };
      const notifs = deriveNotifications({
        currentUser: adminUser,
        agora: data1130,
        userFrontIds: new Set(['front-financeiro']), // Admin não está em Dogs
        frontsMap: {
          'front-dogs': { id: 'front-dogs', nome: 'Dogs', slug: 'dogs' },
          'front-financeiro': { id: 'front-financeiro', nome: 'Financeiro', slug: 'caixinha' },
        },
        dogsRefeicaoManhaHojeFeita: false,
      });

      assert.equal(notifs.some((n) => n.category === 'dogs'), false);
    });
  });


  describe('G18: Folha de Misturas — 15:00h Almoço e 21:00h Janta BRT', () => {
    it('deve alertar às 15:00h se nenhuma mistura foi marcada', () => {
      // 15:15 BRT = 18:15 UTC
      const data1515 = new Date('2026-10-15T18:15:00.000Z');
      const check = shouldNotifyMisturas15hOr21h(data1515, {
        misturasConsumidasHoje: 0,
      });
      assert.equal(check.shouldNotify, true);
      assert.equal(check.window, 'almoco');

      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: data1515,
        minhasMisturasHoje: 0,
      });

      const notif = notifs.find((n) => n.id.startsWith('misturas-almoco-'));
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
      assert.equal(notif.targetScreen, 'misturas');
    });

    it('não deve alertar às 15:00h se o morador já marcou almoço (>= 0.5 misturas)', () => {
      // 15:15 BRT
      const data1515 = new Date('2026-10-15T18:15:00.000Z');
      const check = shouldNotifyMisturas15hOr21h(data1515, {
        misturasConsumidasHoje: 0.5,
      });
      assert.equal(check.shouldNotify, false);
    });

    it('deve alertar às 21:00h se o morador ainda não completou a janta (< 1.0 misturas)', () => {
      // 21:30 BRT = 00:30 UTC do dia seguinte
      const data2130 = new Date('2026-10-16T00:30:00.000Z');
      const check = shouldNotifyMisturas15hOr21h(data2130, {
        misturasConsumidasHoje: 0.5,
      });
      assert.equal(check.shouldNotify, true);
      assert.equal(check.window, 'janta');

      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: data2130,
        minhasMisturasHoje: 0.5,
      });

      const notif = notifs.find((n) => n.id.startsWith('misturas-janta-'));
      assert.ok(notif);
      assert.equal(notif.urgency, 'urgent');
    });

    it('não deve alertar às 21:00h se já marcou cota cheia (1.0 misturas)', () => {
      const data2130 = new Date('2026-10-16T00:30:00.000Z');
      const check = shouldNotifyMisturas15hOr21h(data2130, {
        misturasConsumidasHoje: 1.0,
      });
      assert.equal(check.shouldNotify, false);
    });
  });

  describe('G19: Caixas de Cerveja & Respostas de Baixa', () => {
    it('deve notificar nova caixa atribuída e confirmação/recusa de baixa', () => {
      const notifs = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        minhasCaixasAtribuidas: [
          { id: 'cx-1', motivo_descricao: '7 pontos de bagunça', status: 'pendente' },
        ],
        respostasBaixaCerveja: [
          { id: 'cx-2', motivo_descricao: 'Passou no estágio', aprovada: true },
          { id: 'cx-3', motivo_descricao: 'Aniversário', aprovada: false },
        ],
      });

      const nova = notifs.find((n) => n.id === 'cerveja-nova-cx-1');
      assert.ok(nova);
      assert.equal(nova.targetScreen, 'cervejas');

      const aprovada = notifs.find((n) => n.id === 'cerveja-baixa-resp-cx-2-aprovada');
      assert.ok(aprovada);
      assert.equal(aprovada.title, '🍺 Baixa Confirmada!');

      const recusada = notifs.find((n) => n.id === 'cerveja-baixa-resp-cx-3-recusada');
      assert.ok(recusada);
      assert.equal(recusada.title, '⚠️ Baixa Recusada');
    });
  });

  describe('G20: Alertas Exclusivos do Administrador', () => {
    it('deve alertar apenas o Admin sobre moradores e baixas pendentes de conferência', () => {
      const adminUser = { ...baseUser, role: 'admin' };
      const notifsAdmin = deriveNotifications({
        currentUser: adminUser,
        agora: baseAgora,
        perfisAguardandoAprovacaoCount: 2,
        solicitacoesBaixaCervejaAdminCount: 3,
      });

      const notifAprov = notifsAdmin.find((n) => n.id === 'admin-aprovacoes-2');
      assert.ok(notifAprov);
      assert.equal(notifAprov.targetScreen, 'aprovacoes');
      assert.equal(notifAprov.urgency, 'urgent');

      const notifBaixas = notifsAdmin.find((n) => n.id === 'admin-baixas-cerveja-3');
      assert.ok(notifBaixas);
      assert.equal(notifBaixas.targetScreen, 'cervejas');

      // Morador comum NÃO recebe alertas de admin
      const notifsMorador = deriveNotifications({
        currentUser: baseUser,
        agora: baseAgora,
        perfisAguardandoAprovacaoCount: 2,
        solicitacoesBaixaCervejaAdminCount: 3,
      });

      assert.equal(notifsMorador.some((n) => n.category === 'admin'), false);
    });
  });
});
