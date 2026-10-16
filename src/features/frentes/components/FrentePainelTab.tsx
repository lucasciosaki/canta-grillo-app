import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import type { Front, FrontMember, FuncaFrente, FuncaAtribuicao } from '../../../types/frentes';
import type { Profile } from '../../../types/auth';
import {
  obterApelidoFrente,
  filtrarFuncasPendentesDaFrente,
  podeAtribuirFuncaNaFrente,
} from '../../../types/frentes';
import { Button, Tag } from '../../../components/ui';
import {
  PlusCircle,
  UserCheck,
  CheckCircle2,
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { NovaFuncaModal } from '../../funcas/NovaFuncaModal';

interface FrentePainelTabProps {
  frente: Front;
  membros: FrontMember[];
  isAdmin: boolean;
  isLider: boolean;
  isMembro: boolean;
  onOpenFuncasGeral?: () => void;
  todasFrentes?: Front[];
  todosMembros?: FrontMember[];
  todosMoradores?: Profile[];
}

export const FrentePainelTab: React.FC<FrentePainelTabProps> = ({
  frente,
  membros,
  isAdmin,
  isLider,
  isMembro,
  onOpenFuncasGeral,
  todasFrentes = [],
  todosMembros = [],
  todosMoradores = [],
}) => {
  const { user } = useAuth();
  const [funcas, setFuncas] = useState<FuncaFrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);

  // Modal de Nova Funça
  const [modalNovaFunca, setModalNovaFunca] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novoPrazo, setNovoPrazo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarFuncas = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Busca todas as funças desta frente sem embeds ambíguos
      const { data: funcasData, error: funcasError } = await supabase
        .from('funcas')
        .select('*')
        .eq('frente_id', frente.id)
        .order('created_at', { ascending: false });

      if (funcasError) {
        console.error('[FrentePainelTab] Erro ao carregar funças da frente:', funcasError);
        setFuncas([]);
        return;
      }

      if (!funcasData || funcasData.length === 0) {
        setFuncas([]);
        return;
      }

      const funcaIds = funcasData.map((f: any) => f.id);

      // 2. Busca atribuições dessas funças
      const { data: atribData, error: atribError } = await supabase
        .from('funca_atribuicoes')
        .select('*')
        .in('funca_id', funcaIds);

      if (atribError) {
        console.error('[FrentePainelTab] Erro ao carregar atribuições:', atribError);
      }

      // 3. Coleta os perfis envolvidos (relatores e responsáveis)
      const userIds = new Set<string>();
      funcasData.forEach((f: any) => {
        if (f.relator_id) userIds.add(f.relator_id);
      });
      atribData?.forEach((a: any) => {
        if (a.morador_id) userIds.add(a.morador_id);
        if (a.atribuido_por) userIds.add(a.atribuido_por);
      });

      const profilesMap = new Map<string, any>();
      if (userIds.size > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nome, apelido, geracao')
          .in('id', Array.from(userIds));

        if (!profilesError && profilesData) {
          profilesData.forEach((p: any) => profilesMap.set(p.id, p));
        }
      }

      // 4. Mapeia atribuições para cada funca_id
      const atribMap = new Map<string, FuncaAtribuicao[]>();
      atribData?.forEach((a: any) => {
        const list = atribMap.get(a.funca_id) || [];
        list.push({
          ...a,
          morador: profilesMap.get(a.morador_id) || null,
        });
        atribMap.set(a.funca_id, list);
      });

      // 5. Monta a lista completa
      const formatadas: FuncaFrente[] = funcasData.map((f: any) => ({
        ...f,
        relator: profilesMap.get(f.relator_id) || null,
        atribuicoes: atribMap.get(f.id) || [],
      }));

      setFuncas(formatadas);
    } catch (err) {
      console.error('[FrentePainelTab] Erro inesperado ao carregar funças:', err);
      setFuncas([]);
    } finally {
      setLoading(false);
    }
  }, [frente.id]);

  useEffect(() => {
    carregarFuncas();
  }, [carregarFuncas]);

  // Realtime subscription para atualizações automáticas
  useEffect(() => {
    const channel = supabase
      .channel(`frente-funcas-${frente.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'funcas' },
        () => carregarFuncas()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'funca_atribuicoes' },
        () => carregarFuncas()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [frente.id, carregarFuncas]);

  const funcasPendentes = filtrarFuncasPendentesDaFrente(funcas, frente.id);
  const funcasConcluidas = funcas.filter((f) => f.status === 'concluida');

  const handleCriarFuncaSimples = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !novoTitulo.trim() || !novaDescricao.trim()) return;

    setSalvando(true);
    setErro(null);

    try {
      const { error } = await supabase.from('funcas').insert({
        frente_id: frente.id,
        relator_id: user.id,
        titulo: novoTitulo.trim(),
        descricao: novaDescricao.trim(),
        prazo: novoPrazo ? novoPrazo : null,
        status: 'aberta',
      });

      if (error) {
        setErro('Erro ao cadastrar funça: ' + error.message);
      } else {
        setModalNovaFunca(false);
        setNovoTitulo('');
        setNovaDescricao('');
        setNovoPrazo('');
        await carregarFuncas();
      }
    } catch (err: any) {
      setErro('Falha inesperada: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleAutoatribuir = async (funcaId: string) => {
    if (!user?.id) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from('funca_atribuicoes').insert({
        funca_id: funcaId,
        morador_id: user.id,
        atribuido_por: user.id,
        tipo_atribuicao: 'autoatribuicao',
      });

      if (error) {
        alert('Não foi possível se autoatribuir: ' + error.message);
      } else {
        await carregarFuncas();
      }
    } finally {
      setSalvando(false);
    }
  };

  const handleAtribuirMembro = async (funcaId: string, moradorId: string) => {
    if (!user?.id || !moradorId) return;

    const permissao = podeAtribuirFuncaNaFrente({
      isAdmin,
      isLiderDaFrente: isLider,
      isMembroDaFrente: isMembro,
      autorId: user.id,
      alvoMoradorId: moradorId,
    });

    if (!permissao.permitido || !permissao.tipoAtribuicao) {
      alert('Você não tem permissão para atribuir esta funça.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.from('funca_atribuicoes').insert({
        funca_id: funcaId,
        morador_id: moradorId,
        atribuido_por: user.id,
        tipo_atribuicao: permissao.tipoAtribuicao,
      });

      if (error) {
        alert('Erro ao atribuir funça: ' + error.message);
      } else {
        await carregarFuncas();
      }
    } finally {
      setSalvando(false);
    }
  };

  const handleRemoverAtribuicao = async (funcaId: string, moradorId: string) => {
    if (!confirm('Deseja desatribuir este morador desta funça?')) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('funca_atribuicoes')
        .delete()
        .eq('funca_id', funcaId)
        .eq('morador_id', moradorId);

      if (error) {
        alert('Erro ao desatribuir morador: ' + error.message);
      } else {
        await carregarFuncas();
      }
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirFunca = async (funcaId: string) => {
    if (!confirm('Deseja realmente excluir esta funça da frente?')) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from('funcas').delete().eq('id', funcaId);
      if (error) {
        alert('Erro ao excluir funça: ' + error.message);
      } else {
        await carregarFuncas();
      }
    } finally {
      setSalvando(false);
    }
  };

  const handleMudarStatus = async (
    funcaId: string,
    novoStatus: 'aberta' | 'em_andamento' | 'concluida'
  ) => {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('funcas')
        .update({ status: novoStatus })
        .eq('id', funcaId);

      if (error) {
        alert('Erro ao atualizar status: ' + error.message);
      } else {
        await carregarFuncas();
      }
    } finally {
      setSalvando(false);
    }
  };

  const usarModalCompleto = todosMoradores.length > 0;

  return (
    <div className="space-y-6">
      {/* Topo com botão de Nova Funça */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Funças da Frente</h3>
          <p className="text-xs text-muted">
            {funcasPendentes.length} {funcasPendentes.length === 1 ? 'pendência' : 'pendências'} no painel
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenFuncasGeral && (
            <Button variant="outline" onClick={onOpenFuncasGeral}>
              <span className="text-xs">Ver no Mural Geral ›</span>
            </Button>
          )}
          <Button variant="primary" onClick={() => setModalNovaFunca(true)}>
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <PlusCircle className="w-3.5 h-3.5 text-white" />
              Nova Funça
            </span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">Carregando painel de funças...</div>
      ) : funcasPendentes.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-line rounded-xl bg-surface/50 space-y-1">
          <CheckCircle2 className="w-7 h-7 text-forest/70 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink">Nenhuma funça pendente nesta frente!</p>
          <p className="text-xs text-muted">Todas as missões foram cumpridas ou nenhuma foi aberta ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funcasPendentes.map((f) => {
            const jaAtribuidoAMim = Boolean(
              user?.id && f.atribuicoes?.some((a) => a.morador_id === user.id)
            );
            const membrosDisponiveisParaAtribuicao = membros.filter(
              (m) => !f.atribuicoes?.some((a) => a.morador_id === m.profile_id)
            );
            const podeExcluir =
              isAdmin || isLider || (user?.id && f.relator_id === user.id);

            return (
              <div
                key={f.id}
                className="p-4 rounded-xl border border-line bg-surface space-y-3 shadow-2xs hover:border-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Tag tone={f.status === 'em_andamento' ? 'green' : 'alert'}>
                        {f.status === 'em_andamento' ? 'Em andamento' : 'Aberta'}
                      </Tag>
                      {f.prazo && (
                        <span className="text-[11px] text-muted flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted" />
                          Prazo: {f.prazo.split('-').reverse().join('/')}
                        </span>
                      )}
                      {f.relator && (
                        <span className="text-[11px] text-muted/80">
                          · Aberta por {obterApelidoFrente(f.relator)}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-ink leading-snug">{f.titulo}</h4>
                    <p className="text-xs text-muted mt-1 leading-relaxed whitespace-pre-wrap">{f.descricao}</p>
                    {f.foto_url && (
                      <div className="mt-2.5">
                        <img
                          src={f.foto_url}
                          alt={f.titulo}
                          className="max-h-48 w-auto rounded-lg border border-line object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {podeExcluir && (
                    <button
                      type="button"
                      onClick={() => handleExcluirFunca(f.id)}
                      disabled={salvando}
                      title="Excluir funça"
                      className="p-1.5 text-muted hover:text-clay rounded-md transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Responsáveis atribuídos */}
                <div className="pt-1 border-t border-line/60 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="text-[11px] font-medium text-muted/80">Responsáveis:</span>
                  {f.atribuicoes && f.atribuicoes.length > 0 ? (
                    f.atribuicoes.map((a) => {
                      const podeRemover =
                        isAdmin || isLider || (user?.id && a.morador_id === user.id);
                      return (
                        <span
                          key={a.morador_id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-paper border border-line text-ink font-medium text-[11px]"
                        >
                          {obterApelidoFrente(a.morador)}
                          {podeRemover && (
                            <button
                              type="button"
                              onClick={() => handleRemoverAtribuicao(f.id, a.morador_id)}
                              disabled={salvando}
                              className="text-muted hover:text-clay ml-0.5"
                              title="Desatribuir"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-clay text-[11px] font-medium italic">Sem responsável</span>
                  )}
                </div>

                {/* Linha de ações de atribuição e status */}
                <div className="pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Autoatribuição se não estiver atribuído */}
                    {!jaAtribuidoAMim && (isMembro || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleAutoatribuir(f.id)}
                        disabled={salvando}
                        className="text-xs font-semibold text-forest hover:text-forest-dark flex items-center gap-1 p-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Puxar p/ mim
                      </button>
                    )}

                    {/* Atribuição pelo Líder ou Admin */}
                    {(isLider || isAdmin) && membrosDisponiveisParaAtribuicao.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAtribuirMembro(f.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        disabled={salvando}
                        className="text-xs px-2 py-1 rounded border border-line bg-paper text-ink"
                      >
                        <option value="" disabled>
                          + Atribuir membro...
                        </option>
                        {membrosDisponiveisParaAtribuicao.map((m) => (
                          <option key={m.profile_id} value={m.profile_id}>
                            {obterApelidoFrente(m.profile)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Transição de status */}
                  <div className="flex items-center gap-1.5">
                    {f.status === 'aberta' && (
                      <button
                        type="button"
                        onClick={() => handleMudarStatus(f.id, 'em_andamento')}
                        disabled={salvando}
                        className="text-xs px-2.5 py-1 rounded border border-line text-ink hover:bg-paper font-medium"
                      >
                        Iniciar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleMudarStatus(f.id, 'concluida')}
                      disabled={salvando}
                      className="text-xs px-2.5 py-1 rounded bg-forest text-white hover:bg-forest-dark font-medium flex items-center gap-1 shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Concluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Seção Recolhível de Concluídas */}
      {funcasConcluidas.length > 0 && (
        <div className="pt-4 border-t border-line">
          <button
            type="button"
            onClick={() => setMostrarConcluidas((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted hover:text-ink transition-colors py-2"
          >
            <span>Funças Concluídas ({funcasConcluidas.length})</span>
            {mostrarConcluidas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {mostrarConcluidas && (
            <div className="mt-3 space-y-2">
              {funcasConcluidas.map((f) => (
                <div
                  key={f.id}
                  className="p-3 rounded-lg border border-line bg-paper/60 opacity-80 flex items-center justify-between text-xs gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink line-through truncate">{f.titulo}</p>
                    <p className="text-[11px] text-muted">
                      Criada por {obterApelidoFrente(f.relator)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMudarStatus(f.id, 'em_andamento')}
                    className="text-[11px] text-forest hover:underline shrink-0"
                  >
                    Reabrir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Nova Funça: Completo ou Simples */}
      {modalNovaFunca && usarModalCompleto ? (
        <NovaFuncaModal
          isOpen={modalNovaFunca}
          onClose={() => setModalNovaFunca(false)}
          onSuccess={() => {
            setModalNovaFunca(false);
            carregarFuncas();
          }}
          frentes={todasFrentes.length > 0 ? todasFrentes : [frente]}
          membrosFrentes={todosMembros.length > 0 ? todosMembros : membros}
          todosMoradores={todosMoradores}
          initialFrontId={frente.id}
        />
      ) : modalNovaFunca ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-semibold text-ink">Nova Funça — {frente.nome}</h3>
              <button
                type="button"
                onClick={() => setModalNovaFunca(false)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {erro && (
              <div className="p-2.5 rounded-lg text-xs bg-clay-tint border border-line text-clay flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <form onSubmit={handleCriarFuncaSimples} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Título da tarefa *</label>
                <input
                  type="text"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Medir cloro da piscina"
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Descrição detalhada *</label>
                <textarea
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  placeholder="Instruções ou detalhes da missão..."
                  rows={3}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Prazo sugerido (opcional)</label>
                <input
                  type="date"
                  value={novoPrazo}
                  onChange={(e) => setNovoPrazo(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  full
                  onClick={() => setModalNovaFunca(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" full disabled={salvando || !novoTitulo.trim() || !novaDescricao.trim()}>
                  {salvando ? 'Salvando...' : 'Criar Funça'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
