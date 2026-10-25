import { useState, useEffect, useCallback, useRef } from 'react';
import { MobileShell } from './components/layout/MobileShell';
import type { MainTab } from './components/layout/BottomNav';
import { Button, LinkButton, PageTitle, Row, Section, Tag } from './components/ui';
import { useHouseLinks } from './hooks/useHouseLinks';
import { HomeInstallBanner, CasaInstallCard } from './components/feedback/PWAInstallBanner';
import { PontosBaguncaCarousel } from './components/PontosBaguncaCarousel';
import { useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/auth/AuthGuard';
import { AprovacoesScreen } from './features/admin/AprovacoesScreen';
import { FrentesScreen } from './features/frentes/FrentesScreen';
import { MisturasScreen } from './features/refeicoes/MisturasScreen';
import { DenunciaPontoScreen } from './features/pontos/DenunciaPontoScreen';
import { QuadroPontosScreen } from './features/faxina/QuadroPontosScreen';
import { CervejasScreen } from './features/cervejas/CervejasScreen';
import { FuncasScreen } from './features/funcas/FuncasScreen';
import { AtasScreen } from './features/atas/AtasScreen';
import { MeuPerfilScreen } from './features/perfil/MeuPerfilScreen';
import { supabase } from './lib/supabaseClient';
import { getLocalDateString, numericToMarca } from './types/refeicoes';
import type { PontoBagunca, MensagemPontoBagunca } from './types/pontosBagunca';
import { useNotifications } from './hooks/useNotifications';
import { NotificationsDrawer } from './features/notificacoes/NotificationsDrawer';
import type { NotificationTargetScreen } from './types/notificacoes';
import { getProfilesCached, invalidateCache } from './utils/sessionDataCache';

type Screen =
  | 'home' | 'rotina' | 'casa'
  | 'misturas' | 'quadro' | 'pontoBagunca'
  | 'funcas' | 'cervejas' | 'frentes'
  | 'aprovacoes' | 'atas' | 'perfil';

const chevron = <span className="text-muted">›</span>;

function MainApp() {
  const { user, profile, signOut } = useAuth();
  const { driveUrl, ultimaAtaUrl } = useHouseLinks();

  // Pilha de navegação: a primeira tela é a aba ativa; as demais são telas internas.
  const [stack, setStack] = useState<Screen[]>(['home']);
  const [pontosBagunca, setPontosBagunca] = useState<PontoBagunca[]>([]);
  const [visualizacoesIds, setVisualizacoesIds] = useState<Set<string>>(new Set());
  const [mensagensMap, setMensagensMap] = useState<Record<string, MensagemPontoBagunca[]>>({});

  const [minhaMarcaHoje, setMinhaMarcaHoje] = useState<string | null>(null);
  const [totalMisturasHoje, setTotalMisturasHoje] = useState<number | null>(null);

  const [funcasReais, setFuncasReais] = useState<any[]>([]);
  const [frenteFiltroFuncas, setFrenteFiltroFuncas] = useState<string | null>(null);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    notifications,
    unreadCount,
    permission,
    requestPermission,
    markAsRead,
    markAllAsRead,
    forceRefresh,
    markPontoVisualizadoLocal,
  } = useNotifications();

  const screen = stack[stack.length - 1];

  const handleNavigateFromNotification = (
    targetScreen: NotificationTargetScreen,
    params?: Record<string, any>
  ) => {
    setIsNotificationsOpen(false);
    if (targetScreen === 'home') {
      setStack(['home']);
    } else if (targetScreen === 'misturas') {
      setStack(['rotina', 'misturas']);
    } else if (targetScreen === 'quadro') {
      setStack(['rotina', 'quadro']);
    } else if (targetScreen === 'funcas') {
      if (params?.frenteId) setFrenteFiltroFuncas(params.frenteId);
      setStack(['casa', 'funcas']);
    } else if (targetScreen === 'frentes') {
      setStack(['casa', 'frentes']);
    } else if (targetScreen === 'cervejas') {
      setStack(['casa', 'cervejas']);
    } else if (targetScreen === 'aprovacoes') {
      setStack(['casa', 'aprovacoes']);
    }
  };

  const pontosDebounceRef = useRef<any>(null);

  // Carrega pontos de bagunça, visualizações e mensagens do Supabase em paralelo
  const carregarPontosBagunca = useCallback(async () => {
    try {
      const [pontosRes, perfisData, visRes] = await Promise.all([
        // 1. Pontos abertos (colunas explícitas)
        supabase
          .from('pontos_bagunca')
          .select('id, relator_id, culpado_id, local_descricao, foto_url, status, created_at')
          .eq('status', 'aberta')
          .order('created_at', { ascending: false }),

        // 2. Perfis para mapeamento de apelido (com cache em memória RAM)
        getProfilesCached('id, nome, apelido'),

        // 3. Visualizações do morador logado
        user?.id
          ? supabase
              .from('pontos_bagunca_visualizacoes')
              .select('ponto_id')
              .eq('morador_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const pontosRaw = pontosRes.data || [];
      const perfisMap: Record<string, { id: string; nome: string; apelido: string | null }> = {};
      (perfisData || []).forEach((p: any) => {
        perfisMap[p.id] = p;
      });

      const formatados: PontoBagunca[] = pontosRaw.map((p) => ({
        ...p,
        relator: perfisMap[p.relator_id] || null,
        culpado: p.culpado_id ? perfisMap[p.culpado_id] || null : null,
      }));

      setPontosBagunca(formatados);

      if (visRes.data) {
        setVisualizacoesIds(new Set((visRes.data as any[]).map((v) => v.ponto_id)));
      }

      // 4. Mensagens filtradas estritamente para os pontos atualmente abertos
      const pontosAbertosIds = pontosRaw.map((p) => p.id);
      if (pontosAbertosIds.length > 0) {
        const { data: msgData } = await supabase
          .from('mensagens_ponto_bagunca')
          .select('id, ponto_bagunca_id, autor_id, conteudo, enviada_em')
          .in('ponto_bagunca_id', pontosAbertosIds)
          .order('enviada_em', { ascending: true })
          .limit(100);

        if (msgData) {
          const mapa: Record<string, MensagemPontoBagunca[]> = {};
          msgData.forEach((m) => {
            if (!mapa[m.ponto_bagunca_id]) mapa[m.ponto_bagunca_id] = [];
            mapa[m.ponto_bagunca_id].push({
              ...m,
              autor: perfisMap[m.autor_id] || null,
            });
          });
          setMensagensMap(mapa);
        }
      } else {
        setMensagensMap({});
      }
    } catch (err) {
      console.error('[App] Erro ao carregar pontos de bagunça:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    carregarPontosBagunca();
  }, [carregarPontosBagunca]);

  // Agendador unificado com debounce para evitar tempestade ou duplicação de requisições
  const agendarCarregarPontosBagunca = useCallback(
    (delayMs = 400) => {
      if (pontosDebounceRef.current) clearTimeout(pontosDebounceRef.current);
      pontosDebounceRef.current = setTimeout(() => {
        carregarPontosBagunca();
      }, delayMs);
    },
    [carregarPontosBagunca]
  );

  // Realtime para pontos de bagunça (visualizações locais não disparam refetch no banco)
  useEffect(() => {
    const channel = supabase
      .channel('pontos-bagunca-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_bagunca' }, () =>
        agendarCarregarPontosBagunca(800)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens_ponto_bagunca' }, () =>
        agendarCarregarPontosBagunca(800)
      )
      .subscribe();

    return () => {
      if (pontosDebounceRef.current) clearTimeout(pontosDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [agendarCarregarPontosBagunca]);

  // Carrega resumo do dia de hoje estritamente na Home (evita requisições em subtelas)
  useEffect(() => {
    if (!user?.id || screen !== 'home') return;
    const hoje = getLocalDateString(new Date());
    supabase
      .from('daily_meals')
      .select('usuario_id, misturas_consumidas')
      .eq('data', hoje)
      .then(({ data, error }) => {
        if (!error && data) {
          let total = 0;
          let meuValor: number | null = null;
          data.forEach((m) => {
            const val = Number(m.misturas_consumidas);
            total += val;
            if (m.usuario_id === user.id) meuValor = val;
          });
          setTotalMisturasHoje(total);
          setMinhaMarcaHoje(numericToMarca(meuValor));
        }
      });
  }, [user?.id, screen]);

  // Força atualização manual de dados
  const handleForceRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      invalidateCache();
      await Promise.all([
        forceRefresh(),
        carregarPontosBagunca(),
        carregarFuncasHome(),
      ]);
    } catch (err) {
      console.warn('[App] Erro ao sincronizar manualmente:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Carrega funças para a seção da Home
  const carregarFuncasHome = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('funcas')
        .select(
          'id, titulo, status, prazo, frente_id, frente:fronts(id, nome), atribuicoes:funca_atribuicoes(morador_id, troca_solicitada_para)'
        )
        .order('created_at', { ascending: false });
      if (!error && data) {
        setFuncasReais(data);
      }
    } catch (err) {
      console.error('[App] Erro ao carregar funcas:', err);
    }
  }, []);

  useEffect(() => {
    carregarFuncasHome();
  }, [carregarFuncasHome]);

  const funcasDebounceRef = useRef<any>(null);

  useEffect(() => {
    const triggerDebounced = () => {
      if (funcasDebounceRef.current) clearTimeout(funcasDebounceRef.current);
      funcasDebounceRef.current = setTimeout(() => {
        carregarFuncasHome();
      }, 1000);
    };

    const channel = supabase
      .channel('home-funcas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcas' }, triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funca_atribuicoes' }, triggerDebounced)
      .subscribe();

    return () => {
      if (funcasDebounceRef.current) clearTimeout(funcasDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [carregarFuncasHome]);

  const go = (s: Screen) => setStack((st) => [...st, s]);
  const goBack = () => setStack((st) => st.slice(0, -1));
  const selectTab = (tab: MainTab) => setStack([tab]);

  const minhasFuncasPendentes = funcasReais.filter(
    (f) => f.status !== 'concluida' && f.atribuicoes?.some((a: any) => a.morador_id === user?.id)
  );
  const temTrocaPendenteHome = funcasReais.some(
    (f) => f.atribuicoes?.some((a: any) => a.troca_solicitada_para === user?.id)
  );

  // Identificação dinâmica do morador logado (estritamente apelido da república)
  const nomeExibicao =
    profile?.apelido ||
    user?.user_metadata?.apelido ||
    profile?.nome?.split(' ')[0] ||
    user?.user_metadata?.nome?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Morador';

  const geracaoExibicao = profile?.geracao || user?.user_metadata?.geracao || '025';
  const quartoExibicao = profile?.quarto?.nome || 'Quarto';

  // Registra abertura do ponto (remove blur imediatamente)
  const handleAbrirPonto = async (pontoId: string) => {
    if (!user?.id) return;

    // Atualização otimista local imediata no App e no hook de notificações (0 requests)
    setVisualizacoesIds((prev) => new Set(prev).add(pontoId));
    markPontoVisualizadoLocal(pontoId);

    try {
      await supabase
        .from('pontos_bagunca_visualizacoes')
        .upsert(
          { ponto_id: pontoId, morador_id: user.id },
          { onConflict: 'ponto_id,morador_id' }
        );
    } catch (err) {
      console.error('[App] Erro ao registrar visualização:', err);
    }
  };

  // Morador assume a culpa do ponto de bagunça
  const handleAssumirPonto = async (id: string) => {
    if (!user?.id) return;

    // Otimista: remove do carrossel de abertos
    setPontosBagunca((prev) => prev.filter((p) => p.id !== id));

    const { error } = await supabase
      .from('pontos_bagunca')
      .update({
        status: 'assumida',
        culpado_id: user.id,
        assumida_em: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      alert('Erro ao assumir ponto: ' + error.message);
      carregarPontosBagunca();
    }
  };

  // Envio de mensagem na thread do ponto de bagunça
  const handleEnviarMensagem = async (id: string, texto: string) => {
    if (!user?.id || !texto.trim()) return;

    const { data: novaMsg, error } = await supabase
      .from('mensagens_ponto_bagunca')
      .insert({
        ponto_bagunca_id: id,
        autor_id: user.id,
        conteudo: texto.trim(),
      })
      .select()
      .single();

    if (!error && novaMsg) {
      const msgCompleta: MensagemPontoBagunca = {
        ...novaMsg,
        autor: {
          id: user.id,
          nome: profile?.nome || 'Morador',
          apelido: profile?.apelido || null,
        },
      };

      setMensagensMap((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), msgCompleta],
      }));
    } else if (error) {
      alert('Erro ao enviar mensagem: ' + error.message);
    }
  };

  const renderContent = () => {
    switch (screen) {
      case 'home':
        return (
          <>
            <div className="pt-2 pb-6">
              <button
                type="button"
                onClick={() => go('perfil')}
                className="text-left group cursor-pointer focus:outline-none flex items-center gap-3.5"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Foto de perfil"
                    className="w-13 h-13 rounded-full object-cover border-2 border-forest/20 group-hover:border-forest transition-colors shrink-0 shadow-xs"
                  />
                ) : (
                  <div className="w-13 h-13 rounded-full bg-mint text-forest font-bold text-lg flex items-center justify-center shrink-0 border border-line group-hover:border-forest transition-colors shadow-xs">
                    {(nomeExibicao || 'M').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-muted group-hover:text-forest transition-colors flex items-center gap-1">
                    <span>{geracaoExibicao} · {quartoExibicao}</span>
                    <span className="text-xs opacity-60">›</span>
                  </p>
                  <h2 className="text-3xl font-semibold tracking-tight text-ink mt-0.5 group-hover:text-forest transition-colors truncate">
                    Salve, {nomeExibicao}
                  </h2>
                </div>
              </button>
            </div>

            {/* Banner dispensável de instalação PWA */}
            <HomeInstallBanner />

            {/* Carrossel de pontos de bagunça com blur, 24h e thread */}
            <PontosBaguncaCarousel
              pontos={pontosBagunca}
              currentUserId={user?.id}
              visualizacoesIds={visualizacoesIds}
              onAbrirPonto={handleAbrirPonto}
              onAssumirPonto={handleAssumirPonto}
              onEnviarMensagem={handleEnviarMensagem}
              onNovaDenunciaClick={() => go('pontoBagunca')}
              mensagensMap={mensagensMap}
            />

            <div className="space-y-2.5 mb-7">
              <button
                onClick={() => go('misturas')}
                className="w-full p-4 rounded-xl bg-forest hover:bg-forest-dark text-white flex items-center justify-between text-left transition-all active:scale-[0.99] shadow-xs"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/80 font-bold">Folha de Misturas</p>
                  <h3 className="text-base font-semibold mt-0.5">Marcar almoço e janta</h3>
                  {totalMisturasHoje !== null && (
                    <p className="text-xs text-white/80 mt-1">
                      {totalMisturasHoje.toFixed(1).replace('.0', '')} misturas hoje na república
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-white/80 block uppercase font-medium">Sua cota</span>
                  <span className="inline-block mt-0.5 px-3 py-1 rounded-lg bg-white/20 font-bold text-lg leading-tight backdrop-blur-xs">
                    {minhaMarcaHoje || '—'}
                  </span>
                </div>
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="outline" onClick={() => go('quadro')}>Foto do quadro</Button>
                <Button variant="outline" onClick={() => go('pontoBagunca')}>+ Denunciar Ponto</Button>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-medium text-muted">Links da casa</h3>
                <button
                  type="button"
                  onClick={() => go('atas')}
                  className="text-xs text-forest hover:text-forest-dark font-medium flex items-center gap-0.5 cursor-pointer"
                >
                  Gerenciar / Histórico ›
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <LinkButton href={ultimaAtaUrl} emptyLabel="Nenhuma ata">Última ata</LinkButton>
                <LinkButton href={driveUrl} emptyLabel="Drive indisponível">Drive da rep</LinkButton>
              </div>
            </div>

            

            <Section title="Suas funças pendentes">
              {temTrocaPendenteHome && (
                <Row
                  title="Pedido de troca de funça recebido!"
                  meta="Toque para ver e aceitar ou recusar"
                  onClick={() => go('funcas')}
                  right={<Tag tone="alert">Troca pendente</Tag>}
                />
              )}
              {minhasFuncasPendentes.length === 0 ? (
                <Row
                  title="Nenhuma funça pendente"
                  meta="Aproveite o dia ou veja as funças da casa"
                  onClick={() => go('funcas')}
                  right={chevron}
                />
              ) : (
                minhasFuncasPendentes.map((f) => (
                  <Row
                    key={f.id}
                    title={f.titulo}
                    meta={`${f.frente?.nome || 'Geral'} · ${f.status === 'aberta' ? 'Aberta' : 'Em andamento'}`}
                    onClick={() => go('funcas')}
                    right={chevron}
                  />
                ))
              )}
            </Section>
          </>
        );

      case 'rotina':
        return (
          <>
            <PageTitle title="Rotina" hint="O que se repete todo dia" />
            <Section>
              <Row title="Misturas" meta="Marcar almoço e janta" onClick={() => go('misturas')} right={chevron} />
              <Row title="Quadro de pontos" meta="Foto semanal do quadro" onClick={() => go('quadro')} right={chevron} />
              <Row title="Ponto de Bagunça" meta="Denunciar bagunça com foto (regra 24h)" onClick={() => go('pontoBagunca')} right={chevron} />
            </Section>
          </>
        );

      case 'casa':
        return (
          <>
            <PageTitle title="Casa" hint="Organização da república" />
            <CasaInstallCard />
            <Section title="Sua Conta">
              <Row
                title="Meu Perfil & Quarto"
                meta="Editar apelido ou trocar de quarto na rep"
                onClick={() => go('perfil')}
                right={chevron}
              />
            </Section>
            {profile?.role === 'admin' && (
              <Section title="Administração da Casa">
                <Row
                  title="Gestão de Membros"
                  meta="Aprovações, moradores ativos e convidados"
                  onClick={() => go('aprovacoes')}
                  right={chevron}
                />
                <Row
                  title="Gestão de Frentes"
                  meta="Alocar moradores e definir líderes"
                  onClick={() => go('frentes')}
                  right={chevron}
                />
              </Section>
            )}
            <Section title="República">
              <Row title="Funças" meta="Tarefas gerais e das frentes" onClick={() => go('funcas')} right={chevron} />
              <Row title="Frentes" meta="10 frentes e seus chats" onClick={() => go('frentes')} right={chevron} />
              <Row title="Cervejas" meta="Caixas devidas e baixas" onClick={() => go('cervejas')} right={chevron} />
              <Row title="Atas & Links da Casa" meta="Publicar ata, histórico e link do Drive" onClick={() => go('atas')} right={chevron} />
            </Section>
          </>
        );

      case 'misturas':
        return <MisturasScreen onBack={goBack} />;

      case 'quadro':
        return <QuadroPontosScreen onBack={goBack} />;

      case 'pontoBagunca':
        return (
          <DenunciaPontoScreen
            onBack={goBack}
            onSuccess={() => {
              agendarCarregarPontosBagunca(0);
              goBack();
            }}
          />
        );

      case 'funcas':
        return (
          <FuncasScreen
            onBack={goBack}
            initialFrontId={frenteFiltroFuncas}
            onClearInitialFront={() => setFrenteFiltroFuncas(null)}
          />
        );

      case 'cervejas':
        return <CervejasScreen onBack={goBack} />;

      case 'frentes':
        return (
          <FrentesScreen
            onBack={goBack}
            onOpenFuncasDaFrente={(frontId) => {
              setFrenteFiltroFuncas(frontId);
              go('funcas');
            }}
          />
        );

      case 'aprovacoes':
        return <AprovacoesScreen onBack={goBack} />;

      case 'atas':
        return <AtasScreen onBack={goBack} />;

      case 'perfil':
        return <MeuPerfilScreen onBack={goBack} />;
    }
  };

  return (
    <>
      <MobileShell
        currentTab={stack[0] as MainTab}
        onTabChange={selectTab}
        title="Canta Grillo"
        subtitle="República desde 2004"
        unreadNotifications={unreadCount}
        onNotificationsClick={() => setIsNotificationsOpen(true)}
        onRefresh={handleForceRefreshAll}
        isRefreshing={isRefreshing}
        onSignOut={signOut}
      >
        {renderContent()}
      </MobileShell>

      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        permission={permission}
        onRequestPermission={requestPermission}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onNavigate={handleNavigateFromNotification}
        onRefresh={handleForceRefreshAll}
        isRefreshing={isRefreshing}
      />
    </>
  );
}


export function App() {
  return (
    <AuthGuard>
      <MainApp />
    </AuthGuard>
  );
}

export default App;
