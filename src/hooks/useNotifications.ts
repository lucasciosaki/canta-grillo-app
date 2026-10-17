import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  type AppNotification,
  type NotificationEvaluationContext,
  deriveNotifications,
  getBrasiliaDateParts,
} from '../types/notificacoes';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendBrowserPush,
  hasBeenPushed,
  prunePushedEvents,
} from '../utils/browserPush';

const STORAGE_KEY_READ = 'canta_grillo_read_notifications_v1';

export function useNotifications() {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [isLoading, setIsLoading] = useState(false);

  // Armazena IDs de notificações lidas pelo usuário
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY_READ);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const readIdsRef = useRef(readIds);
  readIdsRef.current = readIds;

  // Atualiza permissão nativa de notificações
  useEffect(() => {
    setPermission(getNotificationPermission());
    prunePushedEvents();
  }, []);

  const handleRequestPermission = useCallback(async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    return res;
  }, []);

  // Marca uma notificação individual como lida
  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(Array.from(next)));
      } catch (err) {
        console.warn('[useNotifications] Falha ao salvar lidas:', err);
      }
      return next;
    });

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  // Marca todas as notificações atuais como lidas
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const allIds = prev.map((n) => n.id);
      setReadIds((prevRead) => {
        const next = new Set([...prevRead, ...allIds]);
        try {
          localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(Array.from(next)));
        } catch (err) {
          console.warn('[useNotifications] Falha ao salvar lidas:', err);
        }
        return next;
      });
      return prev.map((n) => ({ ...n, read: true }));
    });
  }, []);

  // Limpa lista de notificações
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Busca todos os dados necessários do Supabase e deriva as notificações
  const carregarNotificacoes = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    try {
      const agora = new Date();
      const { dateStr } = getBrasiliaDateParts(agora);
      const isAdmin = profile?.role === 'admin';

      // 1. Perfis para mapeamento de apelido
      const { data: perfisRaw } = await supabase
        .from('profiles')
        .select('id, nome, apelido, role, ativo, quarto_id');
      const perfisMap: Record<string, any> = {};
      perfisRaw?.forEach((p) => {
        perfisMap[p.id] = p;
      });

      // 2. Pontos de Bagunça abertos e visualizações do morador
      const { data: pontosRaw } = await supabase
        .from('pontos_bagunca')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: visData } = await supabase
        .from('pontos_bagunca_visualizacoes')
        .select('ponto_id')
        .eq('morador_id', user.id);
      const visualizacoesIds = new Set<string>((visData || []).map((v) => v.ponto_id));

      // 3. Mensagens de discussão em pontos de bagunça abertos
      const pontosAbertosIds = new Set((pontosRaw || []).filter((p) => p.status === 'aberta').map((p) => p.id));
      const { data: msgPontosRaw } = await supabase
        .from('mensagens_ponto_bagunca')
        .select('*')
        .order('enviada_em', { ascending: false })
        .limit(20);

      const pontosMensagens = (msgPontosRaw || [])
        .filter((m) => pontosAbertosIds.has(m.ponto_bagunca_id) && m.autor_id !== user.id)
        .map((m) => {
          const ponto = pontosRaw?.find((p) => p.id === m.ponto_bagunca_id);
          const autor = perfisMap[m.autor_id];
          return {
            id: m.id,
            ponto_bagunca_id: m.ponto_bagunca_id,
            autor_id: m.autor_id,
            conteudo: m.conteudo,
            enviada_em: m.enviada_em,
            autor_apelido: autor?.apelido || autor?.nome?.split(' ')[0] || 'Morador',
            ponto_local_descricao: ponto?.local_descricao || 'Ponto de Bagunça',
          };
        });

      // Pontos individuais assumidos pelo morador no mês vigente
      const inicioMesStr = `${dateStr.slice(0, 7)}-01`;
      const pontosDoMorador = (pontosRaw || []).filter(
        (p) => p.culpado_id === user.id && p.created_at >= inicioMesStr
      );
      const pontosIndividuaisCreditados = pontosDoMorador.map((p) => ({
        id: p.id,
        local_descricao: p.local_descricao,
        totalPontosMes: pontosDoMorador.length,
      }));

      // 4. Frentes e Participação
      const { data: frontsRaw } = await supabase.from('fronts').select('id, nome, slug');
      const frontsMap: Record<string, { id: string; nome: string; slug: string }> = {};
      frontsRaw?.forEach((f) => {
        frontsMap[f.id] = f;
      });

      const { data: meusMembrosRaw } = await supabase
        .from('front_members')
        .select('*')
        .eq('profile_id', user.id);

      const userFrontIds = new Set<string>((meusMembrosRaw || []).map((m) => m.front_id));
      const alocacoesFrente = (meusMembrosRaw || []).map((m) => ({
        front_id: m.front_id,
        frente_nome: frontsMap[m.front_id]?.nome || 'Frente',
        is_lider: Boolean(m.is_lider),
        data_inicio: m.data_inicio || agora.toISOString(),
      }));

      // Mensagens recentes nos chats das frentes do morador
      let mensagensFrente: any[] = [];
      if (userFrontIds.size > 0) {
        const { data: msgFrentesRaw } = await supabase
          .from('mensagens_frente')
          .select('*')
          .in('frente_id', Array.from(userFrontIds))
          .order('enviada_em', { ascending: false })
          .limit(20);

        mensagensFrente = (msgFrentesRaw || [])
          .filter((m) => m.autor_id !== user.id)
          .map((m) => {
            const autor = perfisMap[m.autor_id];
            return {
              id: m.id,
              frente_id: m.frente_id,
              autor_id: m.autor_id,
              conteudo: m.conteudo,
              enviada_em: m.enviada_em,
              autor_apelido: autor?.apelido || autor?.nome?.split(' ')[0] || 'Morador',
              frente_nome: frontsMap[m.frente_id]?.nome || 'Frente',
            };
          });
      }

      // 5. Quadro de Faxina
      let escalasQuarto: any = null;
      let quartoFiscalId: string | null = null;
      let tarefasFiscalPendenteOntem: any[] = [];
      let novasFotosFiscalHoje: any[] = [];
      let pontosFaltaRecebidos: any[] = [];

      // Descobre área de Halls e quarto escalado hoje
      const { data: areasRaw } = await supabase.from('areas_comuns').select('id, nome');
      const hallsArea = areasRaw?.find((a) => a.nome.toLowerCase().includes('halls'));

      // Escala da semana
      const { data: escalasSemanaRaw } = await supabase
        .from('escala_semanal_faxina')
        .select('*');

      if (hallsArea && escalasSemanaRaw) {
        const itemHalls = escalasSemanaRaw.find((e) => e.area_comum_id === hallsArea.id);
        if (itemHalls) quartoFiscalId = itemHalls.quarto_id;
      }

      if (profile?.quarto_id && escalasSemanaRaw) {
        const minhaEscala = escalasSemanaRaw.find((e) => e.quarto_id === profile.quarto_id);
        if (minhaEscala) {
          const areaNome = areasRaw?.find((a) => a.id === minhaEscala.area_comum_id)?.nome;
          // Verifica se enviou foto hoje
          const { data: tarefaHojeRaw } = await supabase
            .from('registro_diario_faxina')
            .select('*')
            .eq('quarto_id', profile.quarto_id)
            .eq('data', dateStr)
            .maybeSingle();

          escalasQuarto = {
            semana_ano: minhaEscala.semana_ano,
            pontos_faltas: minhaEscala.pontos_faltas,
            area_nome: areaNome,
            isEscaladoHoje: Boolean(minhaEscala),
            jaEnviouFotoHoje: tarefaHojeRaw?.status === 'cumprido',
          };

          if (minhaEscala.pontos_faltas > 0) {
            pontosFaltaRecebidos.push({
              id: minhaEscala.id || `falta-${minhaEscala.semana_ano}`,
              motivo: areaNome || 'Faxina semanal',
              totalFaltasSemana: minhaEscala.pontos_faltas,
            });
          }
        }
      }

      // Se for fiscal (Halls): busca fotos pendentes
      const isFiscal = Boolean(
        profile?.quarto_id && quartoFiscalId === profile.quarto_id
      );
      if (isFiscal) {
        const { data: registrosPendentes } = await supabase
          .from('registro_diario_faxina')
          .select('id, data, status, fiscal_status, quarto:quartos(nome), area:areas_comuns(nome)')
          .eq('status', 'cumprido')
          .eq('fiscal_status', 'pendente');

        if (registrosPendentes) {
          registrosPendentes.forEach((r: any) => {
            if (r.data === dateStr) {
              novasFotosFiscalHoje.push({
                id: r.id,
                quarto_nome: r.quarto?.nome || 'Quarto',
                area_nome: r.area?.nome || 'Área',
              });
            } else {
              tarefasFiscalPendenteOntem.push({
                id: r.id,
                quarto_nome: r.quarto?.nome || 'Quarto',
                area_nome: r.area?.nome || 'Área',
              });
            }
          });
        }
      }

      // 6. Funcas & Trocas
      const { data: funcasRaw } = await supabase
        .from('funcas')
        .select('id, titulo, status, prazo, frente_id, relator_id, atribuicoes:funca_atribuicoes(morador_id, troca_solicitada_para, atribuido_em)');

      const minhasFuncasAtribuidas: any[] = [];
      const novasFuncasNaMinhaFrente: any[] = [];
      const pedidosTrocaRecebidos: any[] = [];

      funcasRaw?.forEach((f) => {
        // Atribuída a mim
        const minhaAtribuicao = f.atribuicoes?.find((a: any) => a.morador_id === user.id);
        if (minhaAtribuicao && f.status !== 'concluida') {
          minhasFuncasAtribuidas.push({
            id: f.id,
            titulo: f.titulo,
            status: f.status,
            prazo: f.prazo,
          });
        }

        // Aberta na minha frente
        if (f.frente_id && userFrontIds.has(f.frente_id) && f.relator_id !== user.id) {
          novasFuncasNaMinhaFrente.push({
            id: f.id,
            frente_id: f.frente_id,
            frente_nome: frontsMap[f.frente_id]?.nome || 'Frente',
            titulo: f.titulo,
            relator_id: f.relator_id,
          });
        }

        // Pedido de troca solicitado para mim
        const trocaParaMim = f.atribuicoes?.find((a: any) => a.troca_solicitada_para === user.id);
        if (trocaParaMim) {
          const solicitante = perfisMap[trocaParaMim.morador_id];
          pedidosTrocaRecebidos.push({
            funca_id: f.id,
            titulo: f.titulo,
            solicitante_apelido: solicitante?.apelido || solicitante?.nome?.split(' ')[0] || 'Morador',
          });
        }
      });

      // 7. Mercado
      let solicitacoesMercado: any[] = [];
      const isMercadoMember = Array.from(userFrontIds).some(
        (fId) => frontsMap[fId]?.slug === 'mercado'
      );
      if (isMercadoMember) {
        const { data: solRaw } = await supabase
          .from('solicitacoes_mercado')
          .select('item_id, solicitado_por, status, item:market_catalog(nome)')
          .eq('status', 'solicitado')
          .limit(10);

        solicitacoesMercado = (solRaw || []).map((s: any) => {
          const solicitante = perfisMap[s.solicitado_por];
          return {
            id: `${s.item_id}-${s.solicitado_por}`,
            item_nome: s.item?.nome || 'Item',
            solicitante_apelido: solicitante?.apelido || solicitante?.nome?.split(' ')[0] || 'Morador',
            solicitado_por: s.solicitado_por,
          };
        });
      }

      // 8. Dogs
      let dogsRefeicaoManhaHojeFeita = false;
      let dogsRefeicaoNoiteHojeFeita = false;
      const isDogsMember = Array.from(userFrontIds).some(
        (fId) => frontsMap[fId]?.slug === 'dogs'
      );
      if (isDogsMember) {
        const { data: dogsRaw } = await supabase
          .from('dogs_refeicoes_diarias')
          .select('turno')
          .eq('data', dateStr);

        dogsRaw?.forEach((d) => {
          if (d.turno === 'manha') dogsRefeicaoManhaHojeFeita = true;
          if (d.turno === 'noite') dogsRefeicaoNoiteHojeFeita = true;
        });
      }

      // 9. Folha de Misturas hoje
      let minhasMisturasHoje: number | null = null;
      const { data: mealRaw } = await supabase
        .from('daily_meals')
        .select('misturas_consumidas')
        .eq('usuario_id', user.id)
        .eq('data', dateStr)
        .maybeSingle();

      if (mealRaw) {
        minhasMisturasHoje = Number(mealRaw.misturas_consumidas);
      }

      // 10. Caixas de Cerveja
      const { data: caixasRaw } = await supabase
        .from('caixas_cerveja')
        .select('*')
        .eq('morador_id', user.id);

      const minhasCaixasAtribuidas = (caixasRaw || []).map((c) => ({
        id: c.id,
        motivo_descricao: c.motivo_descricao,
        status: c.status,
      }));

      // 11. Admin Alertas
      let perfisAguardandoAprovacaoCount = 0;
      let solicitacoesBaixaCervejaAdminCount = 0;
      if (isAdmin) {
        const { count: perfisCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('ativo', false);
        perfisAguardandoAprovacaoCount = perfisCount || 0;

        const { count: baixasCount } = await supabase
          .from('caixas_cerveja')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'baixa_solicitada');
        solicitacoesBaixaCervejaAdminCount = baixasCount || 0;
      }

      // Consolida e deriva todas as notificações
      const evaluationContext: NotificationEvaluationContext = {
        currentUser: {
          id: user.id,
          nome: profile?.nome,
          apelido: profile?.apelido,
          role: profile?.role,
          ativo: profile?.ativo,
          quarto_id: profile?.quarto_id,
        },
        agora,
        readNotificationIds: readIdsRef.current,
        pontosBagunca: (pontosRaw || []).map((p) => ({
          id: p.id,
          relator_id: p.relator_id,
          culpado_id: p.culpado_id,
          local_descricao: p.local_descricao,
          status: p.status,
          created_at: p.created_at,
        })),
        visualizacoesIds,
        pontosMensagens,
        pontosIndividuaisCreditados,
        quartoFiscalId,
        escalasQuarto,
        tarefasFiscalPendenteOntem,
        novasFotosFiscalHoje,
        pontosFaltaRecebidos,
        userFrontIds,
        frontsMap,
        mensagensFrente,
        alocacoesFrente,
        minhasFuncasAtribuidas,
        novasFuncasNaMinhaFrente,
        pedidosTrocaRecebidos,
        solicitacoesMercado,
        dogsRefeicaoManhaHojeFeita,
        dogsRefeicaoNoiteHojeFeita,
        minhasMisturasHoje,
        minhasCaixasAtribuidas,
        perfisAguardandoAprovacaoCount,
        solicitacoesBaixaCervejaAdminCount,
      };

      const derivadas = deriveNotifications(evaluationContext);
      setNotifications(derivadas);

      // Dispara push para itens urgentes ou novos que ainda não foram enviados para o aparelho
      derivadas.forEach((notif) => {
        if (!notif.read && !hasBeenPushed(notif.id)) {
          // Dispara push para itens urgentes ou de categorias com notificação externa
          if (
            notif.urgency === 'urgent' ||
            notif.category === 'ponto_bagunca' ||
            notif.category === 'chat_frente' ||
            notif.category === 'mercado' ||
            notif.category === 'cerveja' ||
            notif.category === 'funca'
          ) {
            sendBrowserPush({
              id: notif.id,
              title: notif.title,
              body: notif.message,
              tag: notif.category,
              url: `/?screen=${notif.targetScreen}`,
            });
          }

        }
      });
    } catch (err) {
      console.error('[useNotifications] Erro ao carregar notificações:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, profile?.role, profile?.quarto_id, profile?.nome, profile?.apelido, profile?.ativo]);

  // Executa carga inicial
  useEffect(() => {
    carregarNotificacoes();
  }, [carregarNotificacoes]);

  // Intervalo periódico de 60 segundos para checagem dos horários de corte (15h/21h misturas, 11h/21h dogs, 00h-01h faxina, etc.)
  useEffect(() => {
    const timer = setInterval(() => {
      carregarNotificacoes();
    }, 60000);

    return () => clearInterval(timer);
  }, [carregarNotificacoes]);

  // Escuta unificada via Supabase Realtime
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('realtime_notifications_hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_bagunca' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_ponto_bagunca' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_bagunca_visualizacoes' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_semanal_faxina' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_diario_faxina' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_frente' }, (payload: any) => {
        // Disparo otimista de Browser Push imediato se nova mensagem não for do próprio morador
        if (payload?.eventType === 'INSERT' && payload.new?.autor_id !== user.id) {
          sendBrowserPush({
            id: `msg-frente-push-${payload.new.id}`,
            title: '💬 Nova Mensagem na Frente',
            body: payload.new.conteudo || 'Nova mensagem recebida',
            tag: 'chat_frente',
            url: '/?screen=frentes',
          });
        }
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'front_members' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcas' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funca_atribuicoes' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_mercado' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dogs_refeicoes_diarias' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_meals' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixas_cerveja' }, () => {
        carregarNotificacoes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        carregarNotificacoes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, carregarNotificacoes]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    permission,
    isLoading,
    markAsRead,
    markAllAsRead,
    clearAll,
    requestPermission: handleRequestPermission,
    refresh: carregarNotificacoes,
  };
}
