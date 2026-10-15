import { useState } from 'react';
import { MobileShell } from './components/layout/MobileShell';
import type { MainTab } from './components/layout/BottomNav';
import { PhotoForm } from './components/PhotoForm';
import { Button, LinkButton, PageTitle, Row, Section, Tag } from './components/ui';
import { useHouseLinks } from './hooks/useHouseLinks';
import { ocorrenciasMock } from './data/ocorrenciasMock';
import { OcorrenciasCarousel } from './components/OcorrenciasCarousel';
import { useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/auth/AuthGuard';
import { AprovacoesScreen } from './features/admin/AprovacoesScreen';
import { FrentesScreen } from './features/frentes/FrentesScreen';

type Screen =
  | 'home' | 'rotina' | 'casa'
  | 'misturas' | 'quadro' | 'ocorrencia'
  | 'funcas' | 'cervejas' | 'frentes'
  | 'aprovacoes';

type Marca = '—' | '1/2' | 'X';

const screenTitle: Record<Screen, string> = {
  home: 'Início',
  rotina: 'Rotina',
  casa: 'Casa',
  misturas: 'Misturas',
  quadro: 'Quadro de pontos',
  ocorrencia: 'Ocorrência de ponto',
  funcas: 'Funças',
  cervejas: 'Cervejas',
  frentes: 'Frentes',
  aprovacoes: 'Aprovações',
};

const moradores: { nome: string; marca: Marca }[] = [
  { nome: 'Rodrigo "Cachorrão"', marca: '1/2' },
  { nome: 'Lucas "Bixo 1"', marca: 'X' },
  { nome: 'Matheus "025"', marca: '1/2' },
  { nome: 'Pedro "Valéria"', marca: '—' },
  { nome: 'Gabriel "Caixinha"', marca: 'X' },
];

const funcas = [
  { title: 'Trocar lâmpada do corredor', frente: 'Manutenção', status: 'Aberta', minha: true },
  { title: 'Comprar cloro e medir pH', frente: 'Piscina', status: 'Em andamento', minha: true },
  { title: 'Levar sacos de lixo para a rua', frente: 'Geral', status: 'Atribuída', minha: false },
  { title: 'Regar o jardim da frente', frente: 'Jardim', status: 'Aberta', minha: false },
];

const dividas = [
  { devedor: 'Felipe "025"', motivo: 'Passou no estágio', status: 'Pendente' },
  { devedor: 'Gabriel "026"', motivo: 'Começou a namorar', status: 'Baixa solicitada' },
  { devedor: 'Lucas "Bixo"', motivo: '7 pontos em outubro', status: 'Pendente' },
];


const chevron = <span className="text-muted">›</span>;

function MainApp() {
  const { user, profile, signOut } = useAuth();
  const { driveUrl, ultimaAtaUrl } = useHouseLinks();

  // Pilha de navegação: a primeira tela é a aba ativa; as demais são telas internas.
  const [stack, setStack] = useState<Screen[]>(['home']);
  const [minhaMarca, setMinhaMarca] = useState<Marca>('1/2');
  const [ocorrencias, setOcorrencias] = useState(ocorrenciasMock);

  const screen = stack[stack.length - 1];
  const previous = stack.length > 1 ? stack[stack.length - 2] : null;

  const go = (s: Screen) => setStack((st) => [...st, s]);
  const goBack = () => setStack((st) => st.slice(0, -1));
  const selectTab = (tab: MainTab) => setStack([tab]);

  const back = previous ? { label: screenTitle[previous], onClick: goBack } : undefined;
  const funcasPendentes = funcas.filter((f) => f.minha);

  // Nome e identificação dinâmica do morador logado
  const nomeExibicao =
    profile?.apelido ||
    profile?.nome?.split(' ')[0] ||
    user?.user_metadata?.nome?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Morador';

  const geracaoExibicao = profile?.geracao || user?.user_metadata?.geracao || '025';
  const quartoExibicao = profile?.quarto?.nome || 'Quarto';

  const handleAssumirPonto = (id: string) => {
    setOcorrencias((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'assumida' as const } : o))
    );
  };

  const handleEnviarMensagem = (id: string, texto: string) => {
    const agora = new Date();
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setOcorrencias((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              mensagens: [
                ...o.mensagens,
                { autor: nomeExibicao, texto, hora },
              ],
            }
          : o
      )
    );
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

            {/* Carrossel de ocorrências pendentes (mostra 4 fotos por vez com thread centralizada) */}
            <OcorrenciasCarousel
              ocorrencias={ocorrencias}
              onAssumirPonto={handleAssumirPonto}
              onEnviarMensagem={handleEnviarMensagem}
            />

            <div className="space-y-2.5 mb-7">
              <Button full onClick={() => go('misturas')}>Marcar almoço</Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="outline" onClick={() => go('quadro')}>Foto do quadro</Button>
                <Button variant="outline" onClick={() => go('ocorrencia')}>Foto de ocorrência</Button>
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
              <Row title="Ocorrência de ponto" meta="Registrar ponto individual com foto" onClick={() => go('ocorrencia')} right={chevron} />
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
        return (
          <>
            <PageTitle title="Misturas" hint="Marque sua cota de hoje" back={back} />

            <div className="grid grid-cols-3 gap-2 mb-7">
              {(['—', '1/2', 'X'] as Marca[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMinhaMarca(m)}
                  className={`py-4 rounded-lg text-xl font-semibold transition-colors ${
                    minhaMarca === m
                      ? 'bg-forest text-white'
                      : 'bg-surface border border-line text-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <Section title="Moradores">
              {moradores.map((m) => (
                <Row
                  key={m.nome}
                  title={m.nome}
                  right={
                    <span className="text-sm font-semibold text-forest tabular">
                      {m.nome.startsWith('Rodrigo') ? minhaMarca : m.marca}
                    </span>
                  }
                />
              ))}
            </Section>
          </>
        );

      case 'quadro':
        return (
          <>
            <PageTitle title="Quadro de pontos" hint="Fotografe o quadro da semana" back={back} />
            <PhotoForm submitLabel="Enviar foto do quadro" sentMessage="Foto do quadro registrada." />
          </>
        );

      case 'ocorrencia':
        return (
          <>
            <PageTitle title="Ocorrência de ponto" hint="Registre um ponto individual" back={back} />
            <PhotoForm submitLabel="Registrar ocorrência" sentMessage="Ocorrência registrada.">
              <label className="block">
                <span className="text-xs font-medium text-muted">O que aconteceu?</span>
                <textarea
                  rows={3}
                  placeholder="Ex.: copo deixado na mesa da varanda"
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-muted/60 focus:outline-none focus:border-forest"
                />
              </label>
            </PhotoForm>
          </>
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
        return (
          <>
            <PageTitle title="Cervejas" hint="Cada lançamento vale uma caixa" back={back} />
            <Section>
              {dividas.map((d) => (
                <Row
                  key={d.devedor + d.motivo}
                  title={d.devedor}
                  meta={d.motivo}
                  right={<Tag tone={d.status === 'Pendente' ? 'alert' : 'green'}>{d.status}</Tag>}
                />
              ))}
            </Section>
          </>
        );

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
