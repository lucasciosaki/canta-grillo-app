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
import {
  getProfilesCached,
  getFrontsCached,
  getAreasComunsCached,
  invalidateCache,
} from '../utils/sessionDataCache';

interface RawTablesCache {
  perfis: any[];
  pontos: any[];
  vis: Set<string>;
  msgPontos: any[];
  fronts: any[];
  meusMembros: any[];
  areas: any[];
  escalasSemana: any[];
  tarefasHoje: any[];
  funcas: any[];
  dogs: any[];
  meal: any;
  caixas: any[];
  adminPerfisCount: number;
  adminBaixasCount: number;
  msgFrentes: any[];
  mercado: any[];
  dbNotifications: any[];
}

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

  // Cache modular de dados brutos por tabela
  const rawTablesRef = useRef<RawTablesCache | null>(null);

  // Conjunto de tabelas pendentes de atualização granular
  const changedTablesRef = useRef<Set<string>>(new Set());

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

  // Marca uma notificação individual como lida (memória + localStorage + tabela public.notifications)
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

    if (rawTablesRef.current?.dbNotifications) {
      rawTablesRef.current.dbNotifications = rawTablesRef.current.dbNotifications.map((row: any) =>
        row.event_key === id || row.id === id ? { ...row, read: true } : row
      );
    }

    if (user?.id) {
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('event_key', id)
        .then(() => {});
    }
  }, [user?.id]);

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

    if (rawTablesRef.current?.dbNotifications) {
      rawTablesRef.current.dbNotifications = rawTablesRef.current.dbNotifications.map((row: any) => ({
        ...row,
        read: true,
      }));
    }

    if (user?.id) {
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .then(() => {});
    }
  }, [user?.id]);

  // Limpa lista de notificações
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Busca dados com suporte a recarregamento granular por tabela ou carga completa
  const carregarNotificacoes = useCallback(async (isForce = false, tablesToRefresh?: Set<string>) => {
    if (!user?.id) return;
    setIsLoading(true);

    try {
      const agora = new Date();
      const { dateStr } = getBrasiliaDateParts(agora);
      const isAdmin = profile?.role === 'admin';

      let currentRaw: RawTablesCache;
      const isGranular = !isForce && Boolean(tablesToRefresh && tablesToRefresh.size > 0 && rawTablesRef.current);

      if (isGranular) {
        currentRaw = { ...rawTablesRef.current! };
        const refreshTasks: Promise<void>[] = [];

        if (tablesToRefresh!.has('profiles')) {
          refreshTasks.push((async () => {
            currentRaw.perfis = await getProfilesCached();
          })());
        }
        if (tablesToRefresh!.has('pontos_bagunca')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('pontos_bagunca')
              .select('id, relator_id, culpado_id, local_descricao, status, created_at')
              .order('created_at', { ascending: false });
            if (data) currentRaw.pontos = data;
          })());
        }
        if (tablesToRefresh!.has('pontos_bagunca_visualizacoes')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('pontos_bagunca_visualizacoes')
              .select('ponto_id')
              .eq('morador_id', user.id);
            if (data) currentRaw.vis = new Set(data.map((v: any) => v.ponto_id));
          })());
        }
        if (tablesToRefresh!.has('mensagens_ponto_bagunca')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('mensagens_ponto_bagunca')
              .select('id, ponto_bagunca_id, autor_id, conteudo, enviada_em')
              .order('enviada_em', { ascending: false })
              .limit(20);
            if (data) currentRaw.msgPontos = data;
          })());
        }
        if (tablesToRefresh!.has('fronts')) {
          refreshTasks.push((async () => {
            currentRaw.fronts = await getFrontsCached();
          })());
        }
        if (tablesToRefresh!.has('front_members')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('front_members')
              .select('front_id, is_lider, data_inicio')
              .eq('profile_id', user.id);
            if (data) currentRaw.meusMembros = data || [];
          })());
        }
        if (tablesToRefresh!.has('areas_comuns')) {
          refreshTasks.push((async () => {
            currentRaw.areas = await getAreasComunsCached();
          })());
        }
        if (tablesToRefresh!.has('escala_semanal_faxina')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('escala_semanal_faxina')
              .select('quarto_id, area_comum_id, semana_ano, ano, pontos_faltas');
            if (data) currentRaw.escalasSemana = data || [];
          })());
        }
        if (tablesToRefresh!.has('registro_diario_faxina')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('registro_diario_faxina')
              .select('id, quarto_id, area_comum_id, data, status, fiscal_status')
              .eq('data', dateStr);
            if (data) currentRaw.tarefasHoje = data || [];
          })());
        }
        if (tablesToRefresh!.has('funcas')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('funcas')
              .select('id, titulo, status, prazo, frente_id, relator_id, atribuicoes:funca_atribuicoes(morador_id, troca_solicitada_para, atribuido_em)');
            if (data) currentRaw.funcas = data || [];
          })());
        }
        if (tablesToRefresh!.has('dogs_refeicoes_diarias')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('dogs_refeicoes_diarias')
              .select('turno')
              .eq('data', dateStr);
            if (data) currentRaw.dogs = data || [];
          })());
        }
        if (tablesToRefresh!.has('daily_meals')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('daily_meals')
              .select('misturas_consumidas')
              .eq('usuario_id', user.id)
              .eq('data', dateStr)
              .maybeSingle();
            currentRaw.meal = data;
          })());
        }
        if (tablesToRefresh!.has('caixas_cerveja')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('caixas_cerveja')
              .select('id, motivo_descricao, status')
              .eq('morador_id', user.id);
            if (data) currentRaw.caixas = data || [];
          })());
          if (isAdmin) {
            refreshTasks.push((async () => {
              const { count } = await supabase
                .from('caixas_cerveja')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'baixa_solicitada');
              currentRaw.adminBaixasCount = count || 0;
            })());
          }
        }
        if (tablesToRefresh!.has('solicitacoes_mercado')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('solicitacoes_mercado')
              .select('item_id, solicitado_por, status, item:market_catalog(nome)')
              .eq('status', 'solicitado')
              .limit(10);
            if (data) currentRaw.mercado = data || [];
          })());
        }
        if (tablesToRefresh!.has('mensagens_frente')) {
          const userFrontIds = Array.from(new Set<string>((currentRaw.meusMembros || []).map((m: any) => m.front_id)));
          if (userFrontIds.length > 0) {
            refreshTasks.push((async () => {
              const { data } = await supabase
                .from('mensagens_frente')
                .select('id, frente_id, autor_id, conteudo, enviada_em')
                .in('frente_id', userFrontIds)
                .order('enviada_em', { ascending: false })
                .limit(20);
              if (data) currentRaw.msgFrentes = data || [];
            })());
          }
        }
        if (tablesToRefresh!.has('notifications')) {
          refreshTasks.push((async () => {
            const { data } = await supabase
              .from('notifications')
              .select('id, event_key, category, urgency, title, message, target_screen, target_params, read, created_at')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(50);
            if (data) currentRaw.dbNotifications = data || [];
          })());
        }

        await Promise.all(refreshTasks);
      } else {
        // Carga completa inicial ou forceRefresh
        const [
          perfisData,
          pontosRes,
          visRes,
          msgPontosRes,
          frontsData,
          meusMembrosRes,
          areasData,
          escalasSemanaRes,
          tarefasHojeRes,
          funcasRes,
          dogsRes,
          mealRes,
          caixasRes,
          adminPerfisRes,
          adminBaixasRes,
          dbNotifsRes,
        ] = await Promise.all([
          getProfilesCached(),
          supabase.from('pontos_bagunca').select('id, relator_id, culpado_id, local_descricao, status, created_at').order('created_at', { ascending: false }),
          supabase.from('pontos_bagunca_visualizacoes').select('ponto_id').eq('morador_id', user.id),
          supabase.from('mensagens_ponto_bagunca').select('id, ponto_bagunca_id, autor_id, conteudo, enviada_em').order('enviada_em', { ascending: false }).limit(20),
          getFrontsCached(),
          supabase.from('front_members').select('front_id, is_lider, data_inicio').eq('profile_id', user.id),
          getAreasComunsCached(),
          supabase.from('escala_semanal_faxina').select('quarto_id, area_comum_id, semana_ano, ano, pontos_faltas'),
          supabase.from('registro_diario_faxina').select('id, quarto_id, area_comum_id, data, status, fiscal_status').eq('data', dateStr),
          supabase.from('funcas').select('id, titulo, status, prazo, frente_id, relator_id, atribuicoes:funca_atribuicoes(morador_id, troca_solicitada_para, atribuido_em)'),
          supabase.from('dogs_refeicoes_diarias').select('turno').eq('data', dateStr),
          supabase.from('daily_meals').select('misturas_consumidas').eq('usuario_id', user.id).eq('data', dateStr).maybeSingle(),
          supabase.from('caixas_cerveja').select('id, motivo_descricao, status').eq('morador_id', user.id),
          isAdmin ? supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('ativo', false) : Promise.resolve({ count: 0 }),
          isAdmin ? supabase.from('caixas_cerveja').select('id', { count: 'exact', head: true }).eq('status', 'baixa_solicitada') : Promise.resolve({ count: 0 }),
          supabase.from('notifications').select('id, event_key, category, urgency, title, message, target_screen, target_params, read, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
        ]);

        const userFrontIds = Array.from(new Set<string>((meusMembrosRes.data || []).map((m: any) => m.front_id)));
        const isMercadoMember = userFrontIds.some((fId) => (frontsData || []).find((f: any) => f.id === fId)?.slug === 'mercado');

        const [msgFrentesRes, mercadoRes] = await Promise.all([
          userFrontIds.length > 0
            ? supabase.from('mensagens_frente').select('id, frente_id, autor_id, conteudo, enviada_em').in('frente_id', userFrontIds).order('enviada_em', { ascending: false }).limit(20)
            : Promise.resolve({ data: [] }),
          isMercadoMember
            ? supabase.from('solicitacoes_mercado').select('item_id, solicitado_por, status, item:market_catalog(nome)').eq('status', 'solicitado').limit(10)
            : Promise.resolve({ data: [] }),
        ]);

        currentRaw = {
          perfis: perfisData || [],
          pontos: pontosRes.data || [],
          vis: new Set((visRes.data || []).map((v: any) => v.ponto_id)),
          msgPontos: msgPontosRes.data || [],
          fronts: frontsData || [],
          meusMembros: meusMembrosRes.data || [],
          areas: areasData || [],
          escalasSemana: escalasSemanaRes.data || [],
          tarefasHoje: tarefasHojeRes.data || [],
          funcas: funcasRes.data || [],
          dogs: dogsRes.data || [],
          meal: mealRes.data,
          caixas: caixasRes.data || [],
          adminPerfisCount: adminPerfisRes.count || 0,
          adminBaixasCount: adminBaixasRes.count || 0,
          msgFrentes: msgFrentesRes.data || [],
          mercado: mercadoRes.data || [],
          dbNotifications: dbNotifsRes.data || [],
        };
      }

      rawTablesRef.current = currentRaw;

      // Mapeamento dos perfis
      const perfisMap: Record<string, any> = {};
      currentRaw.perfis.forEach((p) => {
        perfisMap[p.id] = p;
      });

      // Mapeamento das frentes
      const frontsMap: Record<string, { id: string; nome: string; slug: string }> = {};
      currentRaw.fronts.forEach((f) => {
        frontsMap[f.id] = f;
      });

      const userFrontIds = new Set<string>((currentRaw.meusMembros || []).map((m) => m.front_id));
      const alocacoesFrente = (currentRaw.meusMembros || []).map((m) => ({
        front_id: m.front_id,
        frente_nome: frontsMap[m.front_id]?.nome || 'Frente',
        is_lider: Boolean(m.is_lider),
        data_inicio: m.data_inicio || agora.toISOString(),
      }));

      // Pontos de bagunça abertos e mensagens
      const pontosRaw = currentRaw.pontos;
      const visualizacoesIds = currentRaw.vis;
      const pontosAbertosIds = new Set(pontosRaw.filter((p) => p.status === 'aberta').map((p) => p.id));

      const pontosMensagens = (currentRaw.msgPontos || [])
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

      // Mensagens de frente
      const mensagensFrente = (currentRaw.msgFrentes || [])
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

      const solicitacoesMercado = (currentRaw.mercado || []).map((s: any) => {
        const solicitante = perfisMap[s.solicitado_por];
        return {
          id: `${s.item_id}-${s.solicitado_por}`,
          item_nome: s.item?.nome || 'Item',
          solicitante_apelido: solicitante?.apelido || solicitante?.nome?.split(' ')[0] || 'Morador',
          solicitado_por: s.solicitado_por,
        };
      });

      // 5. Quadro de Faxina
      let escalasQuarto: any = null;
      let quartoFiscalId: string | null = null;
      const tarefasFiscalPendenteOntem: any[] = [];
      const novasFotosFiscalHoje: any[] = [];
      const pontosFaltaRecebidos: any[] = [];

      const areasRaw = currentRaw.areas;
      const hallsArea = areasRaw.find((a) => a.nome.toLowerCase().includes('halls'));
      const escalasSemanaRaw = currentRaw.escalasSemana;

      if (hallsArea && escalasSemanaRaw.length > 0) {
        const itemHalls = escalasSemanaRaw.find((e) => e.area_comum_id === hallsArea.id);
        if (itemHalls) quartoFiscalId = itemHalls.quarto_id;
      }

      if (profile?.quarto_id && escalasSemanaRaw.length > 0) {
        const minhaEscala = escalasSemanaRaw.find((e) => e.quarto_id === profile.quarto_id);
        if (minhaEscala) {
          const areaNome = areasRaw.find((a) => a.id === minhaEscala.area_comum_id)?.nome;
          const tarefaHoje = (currentRaw.tarefasHoje || []).find((t) => t.quarto_id === profile.quarto_id);

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
        (currentRaw.tarefasHoje || []).forEach((r) => {
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

      (currentRaw.funcas || []).forEach((f: any) => {
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
      (currentRaw.dogs || []).forEach((d) => {
        if (d.turno === 'manha') dogsRefeicaoManhaHojeFeita = true;
        if (d.turno === 'noite') dogsRefeicaoNoiteHojeFeita = true;
      });

      // 8. Misturas
      let minhasMisturasHoje: number | null = null;
      if (currentRaw.meal) {
        minhasMisturasHoje = Number(currentRaw.meal.misturas_consumidas);
      }

      // 9. Caixas de Cerveja
      const minhasCaixasAtribuidas = (currentRaw.caixas || []).map((c) => ({
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
        perfisAguardandoAprovacaoCount: currentRaw.adminPerfisCount,
        solicitacoesBaixaCervejaAdminCount: currentRaw.adminBaixasCount,
      };

      // Salva no ref em memória para uso no timer de 60s (zero rede!)
      lastEvaluationContextRef.current = evaluationContext;

      const derivadas = deriveNotifications(evaluationContext);

      // Mescla com as linhas persistidas na tabela public.notifications (geradas pelos triggers do banco)
      const mapaMesclado = new Map<string, AppNotification>();
      derivadas.forEach((n) => {
        mapaMesclado.set(n.id, n);
      });

      (currentRaw.dbNotifications || []).forEach((row: any) => {
        const notifId = row.event_key || row.id;
        const jaLida = Boolean(row.read) || readIdsRef.current.has(notifId);
        const existente = mapaMesclado.get(notifId);
        if (existente) {
          mapaMesclado.set(notifId, {
            ...existente,
            read: existente.read || jaLida,
          });
        } else {
          mapaMesclado.set(notifId, {
            id: notifId,
            category: (row.category || 'sistema') as any,
            urgency: (row.urgency || 'normal') as any,
            title: row.title,
            message: row.message,
            timestamp: row.created_at || agora.toISOString(),
            read: jaLida,
            targetScreen: (row.target_screen || 'home') as any,
            targetParams: row.target_params || undefined,
          });
        }
      });

      const listaFinal = Array.from(mapaMesclado.values());
      setNotifications(listaFinal);

      // Dispara push local para novidades se o app estiver aberto
      listaFinal.forEach((notif) => {
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

  // Atualização granular com debounce para eventos Realtime (evita tempestade de requisições)
  const triggerGranularRefresh = useCallback((tableName: string) => {
    changedTablesRef.current.add(tableName);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const toRefresh = new Set(changedTablesRef.current);
      changedTablesRef.current.clear();
      carregarNotificacoes(false, toRefresh);
    }, 1000);
  }, [carregarNotificacoes]);

  // Força uma sincronização limpa completa (invalida cache e busca tudo no banco)
  const forceRefresh = useCallback(async () => {
    invalidateCache();
    await carregarNotificacoes(true);
  }, [carregarNotificacoes]);

  // Atualização imediata em memória quando o usuário abre/visualiza um ponto (0 requisições extras)
  const markPontoVisualizadoLocal = useCallback((pontoId: string) => {
    if (rawTablesRef.current?.vis) {
      rawTablesRef.current.vis.add(pontoId);
    }
    if (lastEvaluationContextRef.current) {
      if (!lastEvaluationContextRef.current.visualizacoesIds) {
        lastEvaluationContextRef.current.visualizacoesIds = new Set<string>();
      }
      lastEvaluationContextRef.current.visualizacoesIds.add(pontoId);
      const atualizado = deriveNotifications({
        ...lastEvaluationContextRef.current,
        agora: new Date(),
        readNotificationIds: readIdsRef.current,
      });
      setNotifications(atualizado);
    }
  }, []);

  // Auto-refresh quando a página voltar do segundo plano, ganhar foco no celular ou reconectar
  useEffect(() => {
    let lastHiddenTime = 0;
    let lastWakeSyncTime = 0;

    const syncOnWakeup = () => {
      const now = Date.now();
      if (now - lastWakeSyncTime < 2000) return;
      lastWakeSyncTime = now;

      // Se ficou mais de 2 minutos em segundo plano, sincroniza tudo do banco
      if (lastHiddenTime > 0 && now - lastHiddenTime > 120_000) {
        forceRefresh();
      } else {
        // Sincronização leve e imediata das tabelas dinâmicas críticas no mobile
        carregarNotificacoes(
          false,
          new Set([
            'notifications',
            'pontos_bagunca',
            'pontos_bagunca_visualizacoes',
            'mensagens_ponto_bagunca',
            'mensagens_frente',
            'funcas',
          ])
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        syncOnWakeup();
      }
    };

    const handleFocusOrPageShow = () => {
      if (document.visibilityState === 'visible') {
        syncOnWakeup();
      }
    };

    const handleOnline = () => {
      forceRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocusOrPageShow);
    window.addEventListener('pageshow', handleFocusOrPageShow);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocusOrPageShow);
      window.removeEventListener('pageshow', handleFocusOrPageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, [forceRefresh, carregarNotificacoes]);

  // Escuta unificada via Supabase Realtime com sincronização cirúrgica por tabela
  useEffect(() => {
    if (!user?.id) return;

    let hasSubscribedOnce = false;

    const channel = supabase
      .channel('realtime_notifications_hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_bagunca' }, (payload: any) => {
        if (payload?.eventType === 'INSERT' && payload.new?.id) {
          const novoPonto = payload.new;

          // 1. Atualização otimista imediata (0ms) na memória do sino de notificações
          if (rawTablesRef.current) {
            const jaExiste = rawTablesRef.current.pontos.some((p: any) => p.id === novoPonto.id);
            if (!jaExiste) {
              rawTablesRef.current.pontos = [novoPonto, ...rawTablesRef.current.pontos];
            }
          }
          if (lastEvaluationContextRef.current) {
            const listaAtual = lastEvaluationContextRef.current.pontosBagunca || [];
            if (!listaAtual.some((p) => p.id === novoPonto.id)) {
              lastEvaluationContextRef.current.pontosBagunca = [
                {
                  id: novoPonto.id,
                  relator_id: novoPonto.relator_id,
                  culpado_id: novoPonto.culpado_id,
                  local_descricao: novoPonto.local_descricao,
                  status: novoPonto.status,
                  created_at: novoPonto.created_at || new Date().toISOString(),
                },
                ...listaAtual,
              ];
              const atualizado = deriveNotifications({
                ...lastEvaluationContextRef.current,
                agora: new Date(),
                readNotificationIds: readIdsRef.current,
              });
              setNotifications(atualizado);
            }
          }

          // 2. Disparo imediato de Browser Push nativo para outros moradores
          if (novoPonto.status === 'aberta' && novoPonto.relator_id !== user.id) {
            sendBrowserPush({
              id: `ponto-novo-${novoPonto.id}`,
              title: '🧹 Novo Ponto de Bagunça',
              body: `${novoPonto.local_descricao || 'Bagunça relatada'} — Abra para ver a foto (prazo de 24h)`,
              tag: 'ponto_bagunca',
              url: '/?screen=home',
            });
          }
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('canta-grillo:ponto-realtime', { detail: payload }));
        }
        triggerGranularRefresh('pontos_bagunca');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_ponto_bagunca' }, (payload: any) => {
        if (payload?.eventType === 'INSERT' && payload.new?.id && payload.new?.autor_id !== user.id) {
          sendBrowserPush({
            id: `ponto-msg-${payload.new.id}`,
            title: '💬 Nova mensagem no Ponto de Bagunça',
            body: payload.new.conteudo || 'Nova mensagem na discussão',
            tag: 'ponto_bagunca',
            url: '/?screen=home',
          });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('canta-grillo:ponto-realtime', { detail: payload }));
        }
        triggerGranularRefresh('mensagens_ponto_bagunca');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_semanal_faxina' }, () =>
        triggerGranularRefresh('escala_semanal_faxina')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_diario_faxina' }, () =>
        triggerGranularRefresh('registro_diario_faxina')
      )
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
        triggerGranularRefresh('mensagens_frente');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'front_members' }, () =>
        triggerGranularRefresh('front_members')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcas' }, () =>
        triggerGranularRefresh('funcas')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funca_atribuicoes' }, () =>
        triggerGranularRefresh('funcas')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_mercado' }, () =>
        triggerGranularRefresh('solicitacoes_mercado')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dogs_refeicoes_diarias' }, () =>
        triggerGranularRefresh('dogs_refeicoes_diarias')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_meals' }, () =>
        triggerGranularRefresh('daily_meals')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixas_cerveja' }, () =>
        triggerGranularRefresh('caixas_cerveja')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        invalidateCache('profiles');
        triggerGranularRefresh('profiles');
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload?.eventType === 'INSERT' && payload.new?.user_id === user.id) {
            const row = payload.new;
            const notifId = row.event_key || row.id;
            const novaNotif: AppNotification = {
              id: notifId,
              category: (row.category || 'sistema') as any,
              urgency: (row.urgency || 'normal') as any,
              title: row.title,
              message: row.message,
              timestamp: row.created_at || new Date().toISOString(),
              read: Boolean(row.read) || readIdsRef.current.has(notifId),
              targetScreen: (row.target_screen || 'home') as any,
              targetParams: row.target_params || undefined,
            };

            setNotifications((prev) => {
              if (prev.some((n) => n.id === notifId)) return prev;
              return [novaNotif, ...prev];
            });

            if (!novaNotif.read) {
              sendBrowserPush({
                id: notifId,
                title: novaNotif.title,
                body: novaNotif.message,
                tag: novaNotif.category,
                url: `/?screen=${novaNotif.targetScreen}`,
              });
            }

            if (row.category === 'ponto_bagunca' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('canta-grillo:ponto-realtime', { detail: payload }));
            }
          }
          triggerGranularRefresh('notifications');
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedOnce) {
            // Reconectou após queda de WebSocket no mobile: sincroniza tabelas críticas
            carregarNotificacoes(
              false,
              new Set([
                'notifications',
                'pontos_bagunca',
                'pontos_bagunca_visualizacoes',
                'mensagens_ponto_bagunca',
                'mensagens_frente',
                'funcas',
              ])
            );
          }
          hasSubscribedOnce = true;
        }
      });

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, triggerGranularRefresh, forceRefresh, carregarNotificacoes]);

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
    forceRefresh,
    markPontoVisualizadoLocal,
  };
}
