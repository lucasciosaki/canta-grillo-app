import { useState, useEffect, useCallback } from 'react';
import { MobileShell } from './components/layout/MobileShell';
import type { MainTab } from './components/layout/BottomNav';
import { Button, LinkButton, PageTitle, Row, Section } from './components/ui';
import { useHouseLinks } from './hooks/useHouseLinks';
import { PontosBaguncaCarousel } from './components/PontosBaguncaCarousel';
import { useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/auth/AuthGuard';
import { AprovacoesScreen } from './features/admin/AprovacoesScreen';
import { FrentesScreen } from './features/frentes/FrentesScreen';
import { MisturasScreen } from './features/refeicoes/MisturasScreen';
import { DenunciaPontoScreen } from './features/pontos/DenunciaPontoScreen';
import { QuadroPontosScreen } from './features/faxina/QuadroPontosScreen';
import { CervejasScreen } from './features/cervejas/CervejasScreen';
import { supabase } from './lib/supabaseClient';
import { getLocalDateString, numericToMarca } from './types/refeicoes';
import type { PontoBagunca, MensagemPontoBagunca } from './types/pontosBagunca';

type Screen =
  | 'home' | 'rotina' | 'casa'
  | 'misturas' | 'quadro' | 'pontoBagunca'
  | 'funcas' | 'cervejas' | 'frentes'
  | 'aprovacoes';

const screenTitle: Record<Screen, string> = {
  home: 'Início',
  rotina: 'Rotina',
  casa: 'Casa',
  misturas: 'Misturas',
  quadro: 'Quadro de pontos',
  pontoBagunca: 'Ponto de Bagunça',
  funcas: 'Funças',
  cervejas: 'Cervejas',
  frentes: 'Frentes',
  aprovacoes: 'Aprovações',
};

const funcas = [
  { title: 'Trocar lâmpada do corredor', frente: 'Manutenção', status: 'Aberta', minha: true },
  { title: 'Comprar cloro e medir pH', frente: 'Piscina', status: 'Em andamento', minha: true },
  { title: 'Levar sacos de lixo para a rua', frente: 'Geral', status: 'Atribuída', minha: false },
  { title: 'Regar o jardim da frente', frente: 'Jardim', status: 'Aberta', minha: false },
];


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

  const screen = stack[stack.length - 1];
  const previous = stack.length > 1 ? stack[stack.length - 2] : null;

  // Carrega pontos de bagunça, visualizações e mensagens do Supabase
  const carregarPontosBagunca = useCallback(async () => {
    try {
      // 1. Busca pontos abertos
      const { data: pontosRaw } = await supabase
        .from('pontos_bagunca')
        .select('*')
        .eq('status', 'aberta')
        .order('created_at', { ascending: false });

      if (!pontosRaw) return;

      // 2. Busca perfis para exibição estrita de apelido
      const { data: perfisRaw } = await supabase
        .from('profiles')
        .select('id, nome, apelido');

      const perfisMap: Record<string, { id: string; nome: string; apelido: string | null }> = {};
      perfisRaw?.forEach((p) => {
        perfisMap[p.id] = p;
      });

      const formatados: PontoBagunca[] = pontosRaw.map((p) => ({
        ...p,
        relator: perfisMap[p.relator_id] || null,
        culpado: p.culpado_id ? perfisMap[p.culpado_id] || null : null,
      }));

      setPontosBagunca(formatados);

      // 3. Busca visualizações do morador logado para controle do blur
      if (user?.id) {
        const { data: visData } = await supabase
          .from('pontos_bagunca_visualizacoes')
          .select('ponto_id')
          .eq('morador_id', user.id);

        if (visData) {
          setVisualizacoesIds(new Set(visData.map((v) => v.ponto_id)));
        }
      }

      // 4. Busca mensagens de discussão
      const { data: msgRaw } = await supabase
        .from('mensagens_ponto_bagunca')
        .select('*')
        .order('enviada_em', { ascending: true });

      if (msgRaw) {
        const mapa: Record<string, MensagemPontoBagunca[]> = {};
        msgRaw.forEach((m) => {
          if (!mapa[m.ponto_bagunca_id]) mapa[m.ponto_bagunca_id] = [];
          mapa[m.ponto_bagunca_id].push({
            ...m,
            autor: perfisMap[m.autor_id] || null,
          });
        });
        setMensagensMap(mapa);
      }
    } catch (err) {
      console.error('[App] Erro ao carregar pontos de bagunça:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    carregarPontosBagunca();
  }, [carregarPontosBagunca]);

  // Realtime para pontos de bagunça, mensagens e visualizações
  useEffect(() => {
    const channel = supabase
      .channel('pontos-bagunca-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pontos_bagunca' },
        () => carregarPontosBagunca()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_ponto_bagunca' },
        () => carregarPontosBagunca()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pontos_bagunca_visualizacoes' },
        () => carregarPontosBagunca()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarPontosBagunca]);

  // Carrega resumo do dia de hoje para o card da Home
  useEffect(() => {
    if (!user?.id) return;
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

  const go = (s: Screen) => setStack((st) => [...st, s]);
  const goBack = () => setStack((st) => st.slice(0, -1));
  const selectTab = (tab: MainTab) => setStack([tab]);

  const back = previous ? { label: screenTitle[previous], onClick: goBack } : undefined;
  const funcasPendentes = funcas.filter((f) => f.minha);

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

    // Atualização otimista
    setVisualizacoesIds((prev) => new Set(prev).add(pontoId));

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
              <p className="text-sm text-muted">
                {geracaoExibicao} · {quartoExibicao}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-ink mt-1">
                Salve, {nomeExibicao}
              </h2>
            </div>

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
              <h3 className="text-xs font-medium text-muted mb-1.5">Links da casa</h3>
              <div className="grid grid-cols-2 gap-2.5">
                <LinkButton href={ultimaAtaUrl} emptyLabel="Nenhuma ata">Última ata</LinkButton>
                <LinkButton href={driveUrl} emptyLabel="Drive indisponível">Drive da rep</LinkButton>
              </div>
            </div>

            

            <Section title="Suas funças pendentes">
              {funcasPendentes.length === 0 ? (
                <Row title="Nenhuma funça pendente" meta="Aproveite o dia" />
              ) : (
                funcasPendentes.map((f) => (
                  <Row
                    key={f.title}
                    title={f.title}
                    meta={`${f.frente} · ${f.status}`}
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
            {profile?.role === 'admin' && (
              <Section title="Administração da Casa">
                <Row
                  title="Aprovações de Moradores"
                  meta="Liberar acesso de novos membros"
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
            <Section>
              <Row title="Funças" meta="Tarefas gerais e das frentes" onClick={() => go('funcas')} right={chevron} />
              <Row title="Frentes" meta="10 frentes e seus chats" onClick={() => go('frentes')} right={chevron} />
              <Row title="Cervejas" meta="Caixas devidas e baixas" onClick={() => go('cervejas')} right={chevron} />
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
              carregarPontosBagunca();
              goBack();
            }}
          />
        );

      case 'funcas':
        return (
          <>
            <PageTitle
              title="Funças"
              hint="Tarefas gerais e das frentes"
              back={back}
              action={<Button>Nova</Button>}
            />
            <Section title="Atribuídas a você">
              {funcas.filter((f) => f.minha).map((f) => (
                <Row key={f.title} title={f.title} meta={`${f.frente} · ${f.status}`} />
              ))}
            </Section>
            <Section title="Da casa">
              {funcas.filter((f) => !f.minha).map((f) => (
                <Row key={f.title} title={f.title} meta={`${f.frente} · ${f.status}`} />
              ))}
            </Section>
          </>
        );

      case 'cervejas':
        return <CervejasScreen onBack={goBack} />;

      case 'frentes':
        return <FrentesScreen onBack={goBack} />;

      case 'aprovacoes':
        return <AprovacoesScreen onBack={goBack} />;
    }
  };

  return (
    <MobileShell
      currentTab={stack[0] as MainTab}
      onTabChange={selectTab}
      title="Canta Grillo"
      subtitle="República desde 2004"
      onSignOut={signOut}
    >
      {renderContent()}
    </MobileShell>
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
