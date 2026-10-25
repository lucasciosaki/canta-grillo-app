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
  subscribeToWebPush,
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

  // Cache em memória do último contexto carregado para evitar requisições de rede no timer de 60s
  const lastEvaluationContextRef = useRef<NotificationEvaluationContext | null>(null);

  // Timer de debounce para eventos do Realtime
  const debounceTimerRef = useRef<any>(null);

  // Atualiza permissão nativa de notificações e tenta inscrever no Web Push se já autorizado
  useEffect(() => {
    const currentPerm = getNotificationPermission();
    setPermission(currentPerm);
    prunePushedEvents();

    if (currentPerm === 'granted' && user?.id) {
      subscribeToWebPush(user.id).catch((err) =>
        console.warn('[useNotifications] Falha silenciosa ao sincronizar Web Push:', err)
      );
    }
  }, [user?.id]);

  const handleRequestPermission = useCallback(async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted' && user?.id) {
      await subscribeToWebPush(user.id);
    }
    return res;
  }, [user?.id]);

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

  // Busca dados em paralelo (Promise.all) com colunas leves (zero Base64)
  const carregarNotificacoes = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    try {
      const agora = new Date();
      const { dateStr } = getBrasiliaDateParts(agora);
      const isAdmin = profile?.role === 'admin';

      // Dispara 1ª onda de consultas independentes em paralelo com colunas restritas e leves
      const [
        perfisRes,
        pontosRes,
        visRes,
        msgPontosRes,
        frontsRes,
        meusMembrosRes,
        areasRes,
        escalasSemanaRes,
        tarefasHojeRes,
        funcasRes,
        dogsRes,
        mealRes,
        caixasRes,
        adminPerfisRes,
        adminBaixasRes,
      ] = await Promise.all([
        // 1. Perfis (sem avatar_url pesado)
        supabase
          .from('profiles')
          .select('id, nome, apelido, role, ativo, quarto_id'),

        // 2. Pontos de Bagunça abertos (SEM foto_url Base64!)
        supabase
          .from('pontos_bagunca')
          .select('id, relator_id, culpado_id, local_descricao, status, created_at')
          .order('created_at', { ascending: false }),

        // 3. Visualizações do morador
        supabase
          .from('pontos_bagunca_visualizacoes')
          .select('ponto_id')
          .eq('morador_id', user.id),

        // 4. Mensagens recentes em pontos de bagunça
        supabase
          .from('mensagens_ponto_bagunca')
          .select('id, ponto_bagunca_id, autor_id, conteudo, enviada_em')
          .order('enviada_em', { ascending: false })
          .limit(20),

        // 5. Frentes
        supabase
          .from('fronts')
          .select('id, nome, slug'),

        // 6. Minhas Frentes
        supabase
          .from('front_members')
          .select('front_id, is_lider, data_inicio')
          .eq('profile_id', user.id),

        // 7. Áreas comuns
        supabase
          .from('areas_comuns')
          .select('id, nome'),

        // 8. Escala semanal de faxina
        supabase
          .from('escala_semanal_faxina')
          .select('id, quarto_id, area_comum_id, semana_ano, pontos_faltas'),

        // 9. Tarefa do dia de faxina (SEM fotos_comprovacao nem fiscal_foto_url!)
        supabase
          .from('registro_diario_faxina')
          .select('id, quarto_id, area_comum_id, data, status, fiscal_status')
          .eq('data', dateStr),

        // 10. Funças e atribuições (SEM foto_url!)
        supabase
          .from('funcas')
          .select('id, titulo, status, prazo, frente_id, relator_id, atribuicoes:funca_atribuicoes(morador_id, troca_solicitada_para, atribuido_em)'),

        // 11. Refeições dos Dogs hoje
        supabase
          .from('dogs_refeicoes_diarias')
          .select('turno')
          .eq('data', dateStr),

        // 12. Misturas do morador hoje
        supabase
          .from('daily_meals')
          .select('misturas_consumidas')
          .eq('usuario_id', user.id)
          .eq('data', dateStr)
          .maybeSingle(),

        // 13. Caixas de cerveja do morador
        supabase
          .from('caixas_cerveja')
          .select('id, motivo_descricao, status')
          .eq('morador_id', user.id),

        // 14. Admin: contagem de perfis pendentes
        isAdmin
          ? supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('ativo', false)
          : Promise.resolve({ count: 0 }),

        // 15. Admin: contagem de baixas de cerveja pendentes
        isAdmin
          ? supabase
              .from('caixas_cerveja')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'baixa_solicitada')
          : Promise.resolve({ count: 0 }),
      ]);

      // Mapeamento dos perfis
      const perfisMap: Record<string, any> = {};
      perfisRes.data?.forEach((p) => {
        perfisMap[p.id] = p;
      });

      // Mapeamento das frentes
      const frontsMap: Record<string, { id: string; nome: string; slug: string }> = {};
      frontsRes.data?.forEach((f) => {
        frontsMap[f.id] = f;
      });

      const userFrontIds = new Set<string>((meusMembrosRes.data || []).map((m) => m.front_id));
      const alocacoesFrente = (meusMembrosRes.data || []).map((m) => ({
        front_id: m.front_id,
        frente_nome: frontsMap[m.front_id]?.nome || 'Frente',
        is_lider: Boolean(m.is_lider),
        data_inicio: m.data_inicio || agora.toISOString(),
      }));

      // Pontos de bagunça abertos e mensagens
      const pontosRaw = pontosRes.data || [];
      const visualizacoesIds = new Set<string>((visRes.data || []).map((v) => v.ponto_id));
      const pontosAbertosIds = new Set(pontosRaw.filter((p) => p.status === 'aberta').map((p) => p.id));

      const pontosMensagens = (msgPontosRes.data || [])
        .filter((m) => pontosAbertosIds.has(m.ponto_bagunca_id) && m.autor_id !== user.id)
        .map((m) => {
          const ponto = pontosRaw.find((p) => p.id === m.ponto_bagunca_id);
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

      // Pontos individuais assumidos no mês vigente
      const inicioMesStr = `${dateStr.slice(0, 7)}-01`;
      const pontosDoMorador = pontosRaw.filter(
        (p) => p.culpado_id === user.id && p.created_at >= inicioMesStr
      );
      const pontosIndividuaisCreditados = pontosDoMorador.map((p) => ({
        id: p.id,
        local_descricao: p.local_descricao,
        totalPontosMes: pontosDoMorador.length,
      }));

      // Mensagens de frente (2ª onda rápida se houver frentes)
      let mensagensFrente: any[] = [];
      let solicitacoesMercado: any[] = [];

      const isMercadoMember = Array.from(userFrontIds).some(
        (fId) => frontsMap[fId]?.slug === 'mercado'
      );

      const [msgFrentesRes, mercadoRes] = await Promise.all([
        userFrontIds.size > 0
          ? supabase
              .from('mensagens_frente')
              .select('id, frente_id, autor_id, conteudo, enviada_em')
              .in('frente_id', Array.from(userFrontIds))
              .order('enviada_em', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
        isMercadoMember
          ? supabase
              .from('solicitacoes_mercado')
              .select('item_id, solicitado_por, status, item:market_catalog(nome)')
              .eq('status', 'solicitado')
              .limit(10)
          : Promise.resolve({ data: [] }),
      ]);

      if (msgFrentesRes.data) {
        mensagensFrente = (msgFrentesRes.data || [])
          .filter((m: any) => m.autor_id !== user.id)
          .map((m: any) => {
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

      if (mercadoRes.data) {
        solicitacoesMercado = (mercadoRes.data || []).map((s: any) => {
          const solicitante = perfisMap[s.solicitado_por];
          return {
            id: `${s.item_id}-${s.solicitado_por}`,
            item_nome: s.item?.nome || 'Item',
            solicitante_apelido: solicitante?.apelido || solicitante?.nome?.split(' ')[0] || 'Morador',
            solicitado_por: s.solicitado_por,
          };
        });
      }

      // 5. Quadro de Faxina
      let escalasQuarto: any = null;
      let quartoFiscalId: string | null = null;
      const tarefasFiscalPendenteOntem: any[] = [];
      const novasFotosFiscalHoje: any[] = [];
      const pontosFaltaRecebidos: any[] = [];

      const areasRaw = areasRes.data || [];
      const hallsArea = areasRaw.find((a) => a.nome.toLowerCase().includes('halls'));
      const escalasSemanaRaw = escalasSemanaRes.data || [];

      if (hallsArea && escalasSemanaRaw.length > 0) {
        const itemHalls = escalasSemanaRaw.find((e) => e.area_comum_id === hallsArea.id);
        if (itemHalls) quartoFiscalId = itemHalls.quarto_id;
      }

      if (profile?.quarto_id && escalasSemanaRaw.length > 0) {
        const minhaEscala = escalasSemanaRaw.find((e) => e.quarto_id === profile.quarto_id);
        if (minhaEscala) {
          const areaNome = areasRaw.find((a) => a.id === minhaEscala.area_comum_id)?.nome;
          const tarefaHoje = (tarefasHojeRes.data || []).find((t) => t.quarto_id === profile.quarto_id);

          escalasQuarto = {
            semana_ano: minhaEscala.semana_ano,
            pontos_faltas: minhaEscala.pontos_faltas,
            area_nome: areaNome,
            isEscaladoHoje: Boolean(minhaEscala),
            jaEnviouFotoHoje: tarefaHoje?.status === 'cumprido',
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

      // Se for fiscal (Halls): verifica fotos pendentes de hoje
      const isFiscal = Boolean(profile?.quarto_id && quartoFiscalId === profile.quarto_id);
      if (isFiscal) {
        (tarefasHojeRes.data || []).forEach((r) => {
          if (r.status === 'cumprido' && r.fiscal_status === 'pendente') {
            novasFotosFiscalHoje.push({
              id: r.id,
              quarto_nome: 'Quarto',
              area_nome: 'Área Comum',
            });
          }
        });
      }

      // 6. Funcas
      const minhasFuncasAtribuidas: any[] = [];
      const novasFuncasNaMinhaFrente: any[] = [];
      const pedidosTrocaRecebidos: any[] = [];

      (funcasRes.data || []).forEach((f: any) => {
        const minhaAtribuicao = f.atribuicoes?.find((a: any) => a.morador_id === user.id);
        if (minhaAtribuicao && f.status !== 'concluida') {
          minhasFuncasAtribuidas.push({
            id: f.id,
            titulo: f.titulo,
            status: f.status,
            prazo: f.prazo,
          });
        }

        if (f.frente_id && userFrontIds.has(f.frente_id) && f.relator_id !== user.id) {
          novasFuncasNaMinhaFrente.push({
            id: f.id,
            frente_id: f.frente_id,
            frente_nome: frontsMap[f.frente_id]?.nome || 'Frente',
            titulo: f.titulo,
            relator_id: f.relator_id,
          });
        }

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

      // 7. Dogs
      let dogsRefeicaoManhaHojeFeita = false;
      let dogsRefeicaoNoiteHojeFeita = false;
      (dogsRes.data || []).forEach((d) => {
        if (d.turno === 'manha') dogsRefeicaoManhaHojeFeita = true;
        if (d.turno === 'noite') dogsRefeicaoNoiteHojeFeita = true;
      });

      // 8. Misturas
      let minhasMisturasHoje: number | null = null;
      if (mealRes.data) {
        minhasMisturasHoje = Number(mealRes.data.misturas_consumidas);
      }

      // 9. Caixas de Cerveja
      const minhasCaixasAtribuidas = (caixasRes.data || []).map((c) => ({
        id: c.id,
        motivo_descricao: c.motivo_descricao,
        status: c.status,
      }));

      // Consolida o contexto de avaliação
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
        pontosBagunca: pontosRaw.map((p) => ({
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
        perfisAguardandoAprovacaoCount: adminPerfisRes.count || 0,
        solicitacoesBaixaCervejaAdminCount: adminBaixasRes.count || 0,
      };

      // Salva no ref em memória para uso no timer de 60s (zero rede!)
      lastEvaluationContextRef.current = evaluationContext;

      const derivadas = deriveNotifications(evaluationContext);
      setNotifications(derivadas);

      // Dispara push local para novidades se o app estiver aberto
      derivadas.forEach((notif) => {
        if (!notif.read && !hasBeenPushed(notif.id)) {
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

  // Carga inicial
  useEffect(() => {
    carregarNotificacoes();
  }, [carregarNotificacoes]);

  // Timer de 60s: reavaliação 100% EM MEMÓRIA (ZERO chamadas de rede ao Supabase!)
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastEvaluationContextRef.current) {
        const atualizado = deriveNotifications({
          ...lastEvaluationContextRef.current,
          agora: new Date(),
          readNotificationIds: readIdsRef.current,
        });
        setNotifications(atualizado);
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Debounced refresh para eventos Realtime (evita tempestade de requisições)
  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      carregarNotificacoes();
    }, 1500);
  }, [carregarNotificacoes]);

  // Escuta unificada via Supabase Realtime com debounce
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('realtime_notifications_hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_bagunca' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_ponto_bagunca' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_bagunca_visualizacoes' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_semanal_faxina' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_diario_faxina' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_frente' }, (payload: any) => {
        if (payload?.eventType === 'INSERT' && payload.new?.autor_id !== user.id) {
          sendBrowserPush({
            id: `msg-frente-push-${payload.new.id}`,
            title: '💬 Nova Mensagem na Frente',
            body: payload.new.conteudo || 'Nova mensagem recebida',
            tag: 'chat_frente',
            url: '/?screen=frentes',
          });
        }
        debouncedRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'front_members' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcas' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funca_atribuicoes' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_mercado' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dogs_refeicoes_diarias' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_meals' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixas_cerveja' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, debouncedRefresh]);

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
