import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Front, FrontMember } from '../../types/frentes';
import type { Profile } from '../../types/auth';
import { PageTitle, Section, Row, Tag, Button } from '../../components/ui';
import { Users, Star, UserPlus, Trash2, X } from 'lucide-react';
import { obterApelidoMorador } from '../../types/funcas';

interface FrentesScreenProps {
  onBack: () => void;
  onOpenFuncasDaFrente?: (frontId: string) => void;
}

export const FrentesScreen: React.FC<FrentesScreenProps> = ({ onBack, onOpenFuncasDaFrente }) => {
  const { profile: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [frentes, setFrentes] = useState<Front[]>([]);
  const [membros, setMembros] = useState<FrontMember[]>([]);
  const [todosMoradores, setTodosMoradores] = useState<Profile[]>([]);
  const [funcasCountMap, setFuncasCountMap] = useState<Record<string, number>>({});
  const [funcasFrente, setFuncasFrente] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Frente selecionada para detalhes / gerenciamento
  const [frenteSelecionada, setFrenteSelecionada] = useState<Front | null>(null);

  // Estado do formulário de adicionar morador
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [moradorSelecionadoId, setMoradorSelecionadoId] = useState('');
  const [isLiderNovo, setIsLiderNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregarDados = async () => {
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

      // 3. Busca lista de moradores ativos (apenas moradores e admins, excluindo externos)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .eq('ativo', true)
        .in('role', ['morador', 'admin'])
        .order('nome');

      if (profilesData) {
        setTodosMoradores(
          (profilesData as Profile[]).filter(
            (p) => p.role === 'morador' || p.role === 'admin'
          )
        );
      }

      // 4. Busca contagem de funças pendentes por frente
      const { data: funcasData } = await supabase
        .from('funcas')
        .select('id, frente_id')
        .neq('status', 'concluida')
        .not('frente_id', 'is', null);

      if (funcasData) {
        const countMap: Record<string, number> = {};
        funcasData.forEach((f) => {
          if (f.frente_id) {
            countMap[f.frente_id] = (countMap[f.frente_id] || 0) + 1;
          }
        });
        setFuncasCountMap(countMap);
      }
    } catch (err) {
      console.error('[Frentes] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Carrega funças da frente selecionada
  useEffect(() => {
    if (!frenteSelecionada) {
      setFuncasFrente([]);
      return;
    }

    supabase
      .from('funcas')
      .select('id, titulo, status, prazo, atribuicoes:funca_atribuicoes(morador:profiles(id, apelido, nome))')
      .eq('frente_id', frenteSelecionada.id)
      .neq('status', 'concluida')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setFuncasFrente(data);
      });
  }, [frenteSelecionada]);

  // Membros da frente atualmente aberta
  // Membros da frente atualmente aberta (excluindo convidados externos)
  const membrosDaFrente = frenteSelecionada
    ? membros.filter((m) => m.front_id === frenteSelecionada.id && m.profile?.role !== 'externo')
    : [];

  const lideres = membrosDaFrente.filter((m) => m.is_lider);
  const integrantes = membrosDaFrente.filter((m) => !m.is_lider);

  // Moradores que ainda NÃO fazem parte desta frente selecionada (apenas moradores/admins)
  const moradoresDisponiveis = todosMoradores
    .filter((m) => m.role === 'morador' || m.role === 'admin')
    .filter((m) => !membrosDaFrente.some((mf) => mf.profile_id === m.id));

  // Adicionar morador à frente
  const handleAdicionarMorador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frenteSelecionada || !moradorSelecionadoId) return;

    // Defesa em profundidade: rejeita qualquer perfil que não seja morador/admin ativo da casa
    const morador = todosMoradores.find((m) => m.id === moradorSelecionadoId);
    if (!morador || (morador.role !== 'morador' && morador.role !== 'admin') || !morador.ativo) {
      setFeedback({ tipo: 'erro', texto: 'Apenas moradores ativos da república podem ser vinculados a uma frente.' });
      return;
    }

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
    const nome = member.profile?.nome || 'este morador';
    if (!confirm(`Deseja remover ${nome} da frente ${frenteSelecionada?.nome}?`)) return;

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

  return (
    <>
      <PageTitle
        title="Frentes da República"
        hint="10 frentes organizacionais e seus líderes"
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

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">
          Carregando frentes e integrantes...
        </div>
      ) : (
        <Section title="10 Frentes Oficiais">
          {frentes.map((f) => {
            const fm = membros.filter((m) => m.front_id === f.id);
            const lideresNomes = fm
              .filter((m) => m.is_lider)
              .map((m) => m.profile?.apelido || m.profile?.nome || 'Líder')
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
                  setFeedback(null);
                }}
                right={
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {funcasCountMap[f.id] > 0 && (
                      <Tag tone="alert">{funcasCountMap[f.id]} {funcasCountMap[f.id] === 1 ? 'funça' : 'funças'}</Tag>
                    )}
                    {fm.length > 0 && <Tag tone="green">{fm.length} {fm.length === 1 ? 'membro' : 'membros'}</Tag>}
                    <span className="text-muted">›</span>
                  </span>
                }
              />
            );
          })}
        </Section>
      )}

      {/* MODAL / PAINEL DE DETALHES E GERENCIAMENTO DA FRENTE */}
      {frenteSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-paper border border-line rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header da Frente */}
            <div className="p-4 border-b border-line bg-surface flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-ink">
                  {frenteSelecionada.nome}
                </h3>
                {frenteSelecionada.descricao && (
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    {frenteSelecionada.descricao}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFrenteSelecionada(null)}
                className="p-1 rounded-md text-muted hover:text-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="p-4 overflow-y-auto space-y-5 flex-1">
              {/* Botão de Adicionar Morador (Exclusivo Admin) */}
              {isAdmin && (
                <div className="pt-1">
                  <Button
                    full
                    variant="outline"
                    onClick={() => {
                      setModalAdicionar(true);
                      setMoradorSelecionadoId('');
                    }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <UserPlus className="w-4 h-4 text-forest" />
                      Adicionar Morador nesta Frente
                    </span>
                  </Button>
                </div>
              )}

              {/* Seção de Líderes */}
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
                            {m.profile?.apelido || m.profile?.nome}
                          </p>
                          <p className="text-[11px] text-muted">
                            Geração {m.profile?.geracao || '025'} · {m.profile?.quarto?.nome || 'Quarto'}
                          </p>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Remover título de Líder"
                              onClick={() => handleToggleLider(m)}
                              disabled={salvando}
                              className="p-1.5 text-xs text-muted hover:text-ink rounded-md transition-colors"
                            >
                              Tirar liderança
                            </button>
                            <button
                              type="button"
                              title="Remover da frente"
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

              {/* Seção de Integrantes */}
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
                            {m.profile?.apelido || m.profile?.nome}
                          </p>
                          <p className="text-[11px] text-muted">
                            Geração {m.profile?.geracao || '025'} · {m.profile?.quarto?.nome || 'Quarto'}
                          </p>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Promover a Líder da Frente"
                              onClick={() => handleToggleLider(m)}
                              disabled={salvando}
                              className="p-1.5 text-xs text-forest hover:bg-mint rounded-md transition-colors flex items-center gap-1"
                            >
                              <Star className="w-3.5 h-3.5" />
                              Promover
                            </button>
                            <button
                              type="button"
                              title="Remover da frente"
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

              {/* Seção de Funças da Frente */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                    Funças desta Frente ({funcasFrente.length})
                  </h4>
                  {onOpenFuncasDaFrente && (
                    <button
                      type="button"
                      onClick={() => {
                        const frontId = frenteSelecionada.id;
                        setFrenteSelecionada(null);
                        onOpenFuncasDaFrente(frontId);
                      }}
                      className="text-xs text-forest hover:text-forest-dark font-medium"
                    >
                      Abrir no painel ›
                    </button>
                  )}
                </div>

                {funcasFrente.length === 0 ? (
                  <p className="text-xs text-muted/80 italic p-3 rounded-lg border border-line bg-surface">
                    Nenhuma funça pendente nesta frente.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {funcasFrente.map((funca) => {
                      const donos = (funca.atribuicoes || [])
                        .map((a: any) => a.morador?.apelido || a.morador?.nome || 'Morador')
                        .join(', ');

                      return (
                        <div
                          key={funca.id}
                          className="p-3 rounded-xl border border-line bg-surface flex items-start justify-between gap-2"
                        >
                          <div>
                            <p className="text-xs font-semibold text-ink">{funca.titulo}</p>
                            <p className="text-[11px] text-muted mt-0.5">
                              {donos ? `Responsável: ${donos}` : 'Sem responsável'}
                              {funca.prazo && ` · Prazo: ${funca.prazo}`}
                            </p>
                          </div>
                          <Tag tone={funca.status === 'em_andamento' ? 'green' : 'neutral'}>
                            {funca.status === 'aberta' ? 'Aberta' : 'Em andamento'}
                          </Tag>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-line bg-surface">
              <Button full variant="outline" onClick={() => setFrenteSelecionada(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMODAL PARA ADICIONAR MORADOR */}
      {modalAdicionar && frenteSelecionada && (
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
                    <option value="">Selecione um morador...</option>
                    {moradoresDisponiveis.map((m) => (
                      <option key={m.id} value={m.id}>
                        {obterApelidoMorador(m)} — Geração {m.geracao || '025'}
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
    </>
  );
};
