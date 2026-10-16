import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Front, FrontMember, FrenteDetalheTab } from '../../types/frentes';
import type { Profile } from '../../types/auth';
import {
  filtrarFrentesVisiveis,
  verificarPermissaoFrente,
  obterApelidoFrente,
} from '../../types/frentes';
import { PageTitle, Section, Row, Tag, Button } from '../../components/ui';
import { FrentePainelTab } from './components/FrentePainelTab';
import { FrenteChatTab } from './components/FrenteChatTab';
import { FrenteDogsTab } from './components/FrenteDogsTab';
import { FrenteMercadoTab } from './components/FrenteMercadoTab';
import { FrenteFinanceiroTab } from './components/FrenteFinanceiroTab';
import {
  Users,
  Star,
  UserPlus,
  Trash2,
  X,
  Dog,
  ShoppingCart,
  MessageSquare,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react';

interface FrentesScreenProps {
  onBack: () => void;
}

export const FrentesScreen: React.FC<FrentesScreenProps> = ({ onBack }) => {
  const { profile: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [frentes, setFrentes] = useState<Front[]>([]);
  const [membros, setMembros] = useState<FrontMember[]>([]);
  const [todosMoradores, setTodosMoradores] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Frente selecionada para tela dedicada
  const [frenteSelecionada, setFrenteSelecionada] = useState<Front | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<FrenteDetalheTab>('painel');

  // Modais de Atalhos Rápidos Universais
  const [modalAtalhoDogs, setModalAtalhoDogs] = useState(false);
  const [modalAtalhoMercado, setModalAtalhoMercado] = useState(false);

  // Estado do formulário de adicionar morador (Admin)
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [moradorSelecionadoId, setMoradorSelecionadoId] = useState('');
  const [isLiderNovo, setIsLiderNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Busca todas as frentes
      const { data: frontsData, error: frontsError } = await supabase
        .from('fronts')
        .select('*')
        .order('nome');

      if (!frontsError && frontsData) {
        setFrentes(frontsData as Front[]);
      }

      // 2. Busca todas as alocações de membros com dados de perfil
      const { data: membersData, error: membersError } = await supabase
        .from('front_members')
        .select('*, profile:profiles(*, quarto:rooms(*))');

      if (!membersError && membersData) {
        setMembros(membersData as FrontMember[]);
      }

      // 3. Busca lista de todos os moradores ativos para o admin poder alocar
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (profilesData) {
        setTodosMoradores(profilesData as Profile[]);
      }
    } catch (err) {
      console.error('[Frentes] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Frentes visíveis para o usuário autenticado
  const frentesVisiveis = filtrarFrentesVisiveis(
    frentes,
    membros,
    currentUser?.id,
    isAdmin
  );

  // Membros da frente atualmente aberta
  const membrosDaFrente = frenteSelecionada
    ? membros.filter((m) => m.front_id === frenteSelecionada.id)
    : [];

  const lideres = membrosDaFrente.filter((m) => m.is_lider);
  const integrantes = membrosDaFrente.filter((m) => !m.is_lider);

  const { podeAcessar, isMembro, isLider } = frenteSelecionada
    ? verificarPermissaoFrente(frenteSelecionada.id, membros, currentUser?.id, isAdmin)
    : { podeAcessar: false, isMembro: false, isLider: false };

  // Moradores que ainda NÃO fazem parte desta frente selecionada
  const moradoresDisponiveis = todosMoradores.filter(
    (m) => !membrosDaFrente.some((mf) => mf.profile_id === m.id)
  );

  // Adicionar morador à frente
  const handleAdicionarMorador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frenteSelecionada || !moradorSelecionadoId) return;

    setSalvando(true);
    setFeedback(null);

    const { error } = await supabase.from('front_members').insert({
      front_id: frenteSelecionada.id,
      profile_id: moradorSelecionadoId,
      is_lider: isLiderNovo,
    });

    if (error) {
      setFeedback({ tipo: 'erro', texto: 'Erro ao vincular morador: ' + error.message });
    } else {
      setFeedback({ tipo: 'ok', texto: 'Morador vinculado com sucesso!' });
      setModalAdicionar(false);
      setMoradorSelecionadoId('');
      setIsLiderNovo(false);
      await carregarDados();
    }
    setSalvando(false);
  };

  // Alternar liderança do morador
  const handleToggleLider = async (member: FrontMember) => {
    setSalvando(true);
    const { error } = await supabase
      .from('front_members')
      .update({ is_lider: !member.is_lider })
      .match({ front_id: member.front_id, profile_id: member.profile_id });

    if (error) {
      alert('Erro ao alterar liderança: ' + error.message);
    } else {
      await carregarDados();
    }
    setSalvando(false);
  };

  // Remover morador da frente
  const handleRemoverMorador = async (member: FrontMember) => {
    const apelido = obterApelidoFrente(member.profile);
    if (!confirm(`Deseja remover ${apelido} da frente ${frenteSelecionada?.nome}?`)) return;

    setSalvando(true);
    const { error } = await supabase
      .from('front_members')
      .delete()
      .match({ front_id: member.front_id, profile_id: member.profile_id });

    if (error) {
      alert('Erro ao remover morador: ' + error.message);
    } else {
      await carregarDados();
    }
    setSalvando(false);
  };

  // Se uma frente estiver selecionada, renderiza a tela dedicada da frente
  if (frenteSelecionada) {
    if (!podeAcessar) {
      return (
        <div className="py-12 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-clay mx-auto" />
          <h3 className="text-base font-semibold text-ink">Acesso Restrito</h3>
          <p className="text-xs text-muted max-w-xs mx-auto">
            Você não participa da frente <strong>{frenteSelecionada.nome}</strong>. Apenas membros e administradores podem acessar seu painel e chat interno.
          </p>
          <Button variant="outline" onClick={() => setFrenteSelecionada(null)}>
            Voltar para Frentes
          </Button>
        </div>
      );
    }

    const temAbaEspecifica = ['dogs', 'mercado', 'financeiro'].includes(frenteSelecionada.slug);
    const labelAbaEspecifica =
      frenteSelecionada.slug === 'dogs'
        ? 'Refeições Dogs'
        : frenteSelecionada.slug === 'mercado'
        ? 'Mercado'
        : 'Externos (Mês)';

    return (
      <div className="space-y-5 animate-in fade-in duration-150">
        <PageTitle
          title={frenteSelecionada.nome}
          hint={frenteSelecionada.descricao || 'Frente Organizacional da Canta Grillo'}
          back={{ label: 'Frentes', onClick: () => setFrenteSelecionada(null) }}
        />

        {/* Barra de Status de Membro */}
        <div className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isLider && (
              <span className="inline-flex items-center gap-1 font-semibold text-forest bg-mint px-2 py-0.5 rounded-md">
                <Star className="w-3.5 h-3.5 fill-forest" />
                Você é Líder desta Frente
              </span>
            )}
            {!isLider && isMembro && (
              <span className="font-medium text-ink">
                Você é integrante desta frente
              </span>
            )}
            {isAdmin && !isMembro && (
              <span className="text-muted font-medium">Acesso de Administrador</span>
            )}
          </div>
          <span className="text-muted font-medium">{membrosDaFrente.length} membros</span>
        </div>

        {/* Abas Internas da Frente */}
        <div className="flex border-b border-line gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setAbaAtiva('painel')}
            className={`pb-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              abaAtiva === 'painel'
                ? 'border-forest text-forest'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Painel da Frente
          </button>

          {temAbaEspecifica && (
            <button
              type="button"
              onClick={() => setAbaAtiva('especifica')}
              className={`pb-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                abaAtiva === 'especifica'
                  ? 'border-forest text-forest'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {frenteSelecionada.slug === 'dogs' && <Dog className="w-3.5 h-3.5" />}
              {frenteSelecionada.slug === 'mercado' && <ShoppingCart className="w-3.5 h-3.5" />}
              {frenteSelecionada.slug === 'financeiro' && <Users className="w-3.5 h-3.5" />}
              {labelAbaEspecifica}
            </button>
          )}

          <button
            type="button"
            onClick={() => setAbaAtiva('chat')}
            className={`pb-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              abaAtiva === 'chat'
                ? 'border-forest text-forest'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat da Frente
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('membros')}
            className={`pb-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              abaAtiva === 'membros'
                ? 'border-forest text-forest'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Membros
          </button>
        </div>

        {/* Conteúdo da Aba Selecionada */}
        {abaAtiva === 'painel' && (
          <FrentePainelTab
            frente={frenteSelecionada}
            membros={membrosDaFrente}
            isAdmin={Boolean(isAdmin)}
            isLider={isLider}
            isMembro={isMembro}
          />
        )}

        {abaAtiva === 'especifica' && frenteSelecionada.slug === 'dogs' && (
          <FrenteDogsTab />
        )}

        {abaAtiva === 'especifica' && frenteSelecionada.slug === 'mercado' && (
          <FrenteMercadoTab isAdmin={Boolean(isAdmin)} isMembroDaFrente={isMembro} />
        )}

        {abaAtiva === 'especifica' && frenteSelecionada.slug === 'financeiro' && (
          <FrenteFinanceiroTab isAdmin={Boolean(isAdmin)} />
        )}

        {abaAtiva === 'chat' && (
          <FrenteChatTab frente={frenteSelecionada} membros={membrosDaFrente} />
        )}

        {abaAtiva === 'membros' && (
          <div className="space-y-5">
            {isAdmin && (
              <Button
                full
                variant="outline"
                onClick={() => {
                  setModalAdicionar(true);
                  setMoradorSelecionadoId(moradoresDisponiveis[0]?.id || '');
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <UserPlus className="w-4 h-4 text-forest" />
                  Adicionar Morador nesta Frente
                </span>
              </Button>
            )}

            {/* Líderes */}
            <div>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-forest fill-forest" />
                Líderes da Frente ({lideres.length})
              </h4>

              {lideres.length === 0 ? (
                <p className="text-xs text-muted/80 italic p-3 rounded-lg border border-line bg-surface">
                  Nenhum líder atribuído a esta frente.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {lideres.map((m) => (
                    <div
                      key={m.profile_id}
                      className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {obterApelidoFrente(m.profile)}
                        </p>
                        <p className="text-[11px] text-muted">
                          Geração {m.profile?.geracao || '025'} · {m.profile?.quarto?.nome || 'Quarto'}
                        </p>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleLider(m)}
                            disabled={salvando}
                            className="p-1.5 text-xs text-muted hover:text-ink rounded-md transition-colors"
                          >
                            Tirar liderança
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoverMorador(m)}
                            disabled={salvando}
                            className="p-1.5 text-clay hover:bg-clay-tint rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Integrantes */}
            <div>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-muted" />
                Integrantes ({integrantes.length})
              </h4>

              {integrantes.length === 0 ? (
                <p className="text-xs text-muted/80 italic p-3 rounded-lg border border-line bg-surface">
                  Nenhum integrante além dos líderes.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {integrantes.map((m) => (
                    <div
                      key={m.profile_id}
                      className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {obterApelidoFrente(m.profile)}
                        </p>
                        <p className="text-[11px] text-muted">
                          Geração {m.profile?.geracao || '025'} · {m.profile?.quarto?.nome || 'Quarto'}
                        </p>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleLider(m)}
                            disabled={salvando}
                            className="p-1.5 text-xs text-forest hover:bg-mint rounded-md transition-colors flex items-center gap-1"
                          >
                            <Star className="w-3.5 h-3.5" />
                            Promover
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoverMorador(m)}
                            disabled={salvando}
                            className="p-1.5 text-clay hover:bg-clay-tint rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Adicionar Morador (Admin) */}
        {modalAdicionar && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-ink">
                  Vincular a {frenteSelecionada.nome}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalAdicionar(false)}
                  className="text-muted hover:text-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {moradoresDisponiveis.length === 0 ? (
                <p className="text-xs text-muted py-2">
                  Todos os moradores ativos já fazem parte desta frente.
                </p>
              ) : (
                <form onSubmit={handleAdicionarMorador} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                      Selecione o Morador
                    </label>
                    <select
                      value={moradorSelecionadoId}
                      onChange={(e) => setMoradorSelecionadoId(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                    >
                      {moradoresDisponiveis.map((m) => (
                        <option key={m.id} value={m.id}>
                          {obterApelidoFrente(m)} — Geração {m.geracao || '025'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={isLiderNovo}
                      onChange={(e) => setIsLiderNovo(e.target.checked)}
                      className="w-4 h-4 text-forest rounded border-line focus:ring-forest"
                    />
                    <span>Nomear este morador como <strong>Líder da Frente</strong></span>
                  </label>

                  <div className="pt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      full
                      onClick={() => setModalAdicionar(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" full disabled={salvando || !moradorSelecionadoId}>
                      {salvando ? 'Salvando...' : 'Adicionar'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // TELA PRINCIPAL DE FRENTES
  return (
    <>
      <PageTitle
        title="Frentes da República"
        hint="Páginas das comissões, chats internos e demandas"
        back={{ label: 'Casa', onClick: onBack }}
      />

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-xs leading-relaxed border ${
            feedback.tipo === 'ok'
              ? 'bg-mint border-line text-forest'
              : 'bg-clay-tint border-line text-clay'
          }`}
        >
          {feedback.texto}
        </div>
      )}

      {/* Seção de Atalhos Rápidos Universais (acessíveis a toda a casa) */}
      <div className="mb-6 space-y-2">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Ações Rápidas da Casa
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="outline" onClick={() => setModalAtalhoDogs(true)}>
            <span className="flex items-center justify-center gap-2 text-xs font-semibold">
              <Dog className="w-4 h-4 text-forest" />
              Alimentar Dogs
            </span>
          </Button>

          <Button variant="outline" onClick={() => setModalAtalhoMercado(true)}>
            <span className="flex items-center justify-center gap-2 text-xs font-semibold">
              <ShoppingCart className="w-4 h-4 text-forest" />
              Pedir Item Mercado
            </span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">
          Carregando frentes e integrantes...
        </div>
      ) : frentesVisiveis.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-line rounded-xl bg-surface/50 space-y-2">
          <Users className="w-8 h-8 text-muted mx-auto mb-1" />
          <p className="text-sm font-semibold text-ink">Nenhuma frente atribuída</p>
          <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
            Você ainda não foi vinculado a nenhuma frente organizacional. Peça ao Administrador da república para incluí-lo na sua frente.
          </p>
        </div>
      ) : (
        <Section title={isAdmin ? '10 Frentes Oficiais (Gestão Total)' : 'Suas Frentes Organizacionais'}>
          {frentesVisiveis.map((f) => {
            const fm = membros.filter((m) => m.front_id === f.id);
            const lideresNomes = fm
              .filter((m) => m.is_lider)
              .map((m) => obterApelidoFrente(m.profile))
              .join(', ');

            return (
              <Row
                key={f.id}
                title={f.nome}
                meta={
                  lideresNomes
                    ? `⭐ Líder: ${lideresNomes} · ${fm.length} ${fm.length === 1 ? 'membro' : 'membros'}`
                    : `${fm.length} ${fm.length === 1 ? 'membro' : 'membros'}`
                }
                onClick={() => {
                  setFrenteSelecionada(f);
                  setAbaAtiva('painel');
                  setFeedback(null);
                }}
                right={
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {fm.length > 0 && <Tag tone="green">{fm.length}</Tag>}
                    <span className="text-muted">›</span>
                  </span>
                }
              />
            );
          })}
        </Section>
      )}

      {/* Modal Rápido: Alimentar Dogs */}
      {modalAtalhoDogs && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Dog className="w-4 h-4 text-forest" />
                Alimentar os Cães
              </span>
              <button
                type="button"
                onClick={() => setModalAtalhoDogs(false)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <FrenteDogsTab compact onSuccess={() => setModalAtalhoDogs(false)} />
          </div>
        </div>
      )}

      {/* Modal Rápido: Pedir Item de Mercado */}
      {modalAtalhoMercado && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShoppingCart className="w-4 h-4 text-forest" />
                Pedir Item de Mercado
              </span>
              <button
                type="button"
                onClick={() => setModalAtalhoMercado(false)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <FrenteMercadoTab compactSolicitar onSuccess={() => setModalAtalhoMercado(false)} />
          </div>
        </div>
      )}
    </>
  );
};
