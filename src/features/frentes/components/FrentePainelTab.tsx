import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import type { Front, FrontMember, FuncaFrente } from '../../../types/frentes';
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
} from 'lucide-react';

interface FrentePainelTabProps {
  frente: Front;
  membros: FrontMember[];
  isAdmin: boolean;
  isLider: boolean;
  isMembro: boolean;
}

export const FrentePainelTab: React.FC<FrentePainelTabProps> = ({
  frente,
  membros,
  isAdmin,
  isLider,
  isMembro,
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
      const { data: funcasData, error: funcasError } = await supabase
        .from('funcas')
        .select(`
          *,
          relator:profiles!funcas_relator_id_fkey(id, nome, apelido),
          atribuicoes:funca_atribuicoes(
            funca_id,
            morador_id,
            tipo_atribuicao,
            atribuido_em,
            morador:profiles(id, nome, apelido, geracao)
          )
        `)
        .eq('frente_id', frente.id)
        .order('created_at', { ascending: false });

      if (!funcasError && funcasData) {
        setFuncas(funcasData as unknown as FuncaFrente[]);
      }
    } catch (err) {
      console.error('[FrentePainelTab] Erro ao carregar funças:', err);
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
        { event: '*', schema: 'public', table: 'funcas', filter: `frente_id=eq.${frente.id}` },
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

  const handleCriarFunca = async (e: React.FormEvent) => {
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

  const handleMudarStatus = async (funcaId: string, novoStatus: 'aberta' | 'em_andamento' | 'concluida') => {
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
        <Button variant="outline" onClick={() => setModalNovaFunca(true)}>
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <PlusCircle className="w-3.5 h-3.5 text-forest" />
            Nova Funça
          </span>
        </Button>
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

            return (
              <div
                key={f.id}
                className="p-4 rounded-xl border border-line bg-surface space-y-3 shadow-2xs hover:border-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Tag tone={f.status === 'em_andamento' ? 'green' : 'alert'}>
                        {f.status === 'em_andamento' ? 'Em andamento' : 'Aberta'}
                      </Tag>
                      {f.prazo && (
                        <span className="text-[11px] text-muted flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted" />
                          Prazo: {f.prazo.split('-').reverse().join('/')}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-ink leading-snug">{f.titulo}</h4>
                    <p className="text-xs text-muted mt-1 leading-relaxed whitespace-pre-wrap">{f.descricao}</p>
                  </div>
                </div>

                {/* Responsáveis atribuídos */}
                <div className="pt-1 border-t border-line/60 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="text-[11px] font-medium text-muted/80">Responsáveis:</span>
                  {f.atribuicoes && f.atribuicoes.length > 0 ? (
                    f.atribuicoes.map((a) => (
                      <span
                        key={a.morador_id}
                        className="px-2 py-0.5 rounded-md bg-paper border border-line text-ink font-medium text-[11px]"
                      >
                        {obterApelidoFrente(a.morador)}
                      </span>
                    ))
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

      {/* Modal de Nova Funça na Frente */}
      {modalNovaFunca && (
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

            <form onSubmit={handleCriarFunca} className="space-y-3.5">
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
      )}
    </div>
  );
};
