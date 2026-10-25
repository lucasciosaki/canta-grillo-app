import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { PageTitle, Tag, Button } from '../../components/ui';
import type { Front, FrontMember } from '../../types/frentes';
import type { Profile } from '../../types/auth';
import { getProfilesCached, getFrontsCached } from '../../utils/sessionDataCache';
import {
  obterApelidoMorador,
  verificarPermissaoAtribuicao,
  podeRemoverResponsavel,
  podeAvancarStatusFunca,
  obterProximoStatusManual,
  type Funca,
  type FuncaAtribuicao,
} from '../../types/funcas';
import { NovaFuncaModal } from './NovaFuncaModal';
import {
  Plus,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Play,
  Trash2,
  UserPlus,
  Users,
  X,
  Sparkles,
} from 'lucide-react';

interface FuncasScreenProps {
  onBack: () => void;
  initialFrontId?: string | null;
  onClearInitialFront?: () => void;
}

export const FuncasScreen: React.FC<FuncasScreenProps> = ({
  onBack,
  initialFrontId = null,
  onClearInitialFront,
}) => {
  const { user, profile } = useAuth();

  // Abas
  const [abaAtiva, setAbaAtiva] = useState<'minhas' | 'todas' | 'reuniao'>('minhas');

  // Dados carregados do banco
  const [funcas, setFuncas] = useState<Funca[]>([]);
  const [frentes, setFrentes] = useState<Front[]>([]);
  const [membrosFrentes, setMembrosFrentes] = useState<FrontMember[]>([]);
  const [todosMoradores, setTodosMoradores] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de abertura individual
  const [modalNovaAberto, setModalNovaAberto] = useState(false);

  // Filtros na aba "Todas"
  const [filtroFrente, setFiltroFrente] = useState<string | null>(initialFrontId);
  const [filtroStatus, setFiltroStatus] = useState<'pendentes' | 'concluidas'>('pendentes');

  // Estado para modal / seletor de Pedir Troca
  const [modalTroca, setModalTroca] = useState<{ funcaId: string; moradorOrigemId: string } | null>(
    null
  );
  const [alvoTrocaId, setAlvoTrocaId] = useState<string>('');

  // Estado para modal rápido de Atribuir Responsável na aba "Todas"
  const [modalAtribuir, setModalAtribuir] = useState<Funca | null>(null);
  const [alvoAtribuirId, setAlvoAtribuirId] = useState<string>('');

  // Estado da Planilha Dinâmica de Criação em Lote (Aba Reunião Semanal)
  const [linhasLote, setLinhasLote] = useState<
    Array<{
      id: string;
      titulo: string;
      frenteId: string | null;
      prazo: string;
      responsaveisIds: string[];
    }>
  >([
    {
      id: 'linha-1',
      titulo: '',
      frenteId: null,
      prazo: '',
      responsaveisIds: [],
    },
  ]);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [filtroReuniaoSemDono, setFiltroReuniaoSemDono] = useState(true);

  // Histórico de concluídas na aba "Minhas"
  const [verConcluidasMinhas, setVerConcluidasMinhas] = useState(false);

  const funcasDebounceRef = useRef<any>(null);

  const carregarDados = useCallback(async () => {
    try {
      // Busca todas as frentes, membros, perfis, funças e atribuições em paralelo
      const [frentesData, membrosData, profilesData, funcasRes, atribData] = await Promise.all([
        getFrontsCached<Front>(),
        supabase.from('front_members').select('*').then(({ data }) => data || []),
        getProfilesCached<Profile>('*'),
        supabase
          .from('funcas')
          .select('*, frente:fronts(id, nome, slug)')
          .order('created_at', { ascending: false }),
        supabase.from('funca_atribuicoes').select('*').then(({ data }) => data || []),
      ]);

      if (frentesData) setFrentes(frentesData as Front[]);
      if (membrosData) setMembrosFrentes(membrosData as FrontMember[]);

      const profilesMap: Record<string, Profile> = {};
      if (profilesData) {
        (profilesData as Profile[]).forEach((p) => {
          profilesMap[p.id] = p;
        });

        const apenasMoradoresAtivos = (profilesData as Profile[]).filter(
          (p) => (p.role === 'morador' || p.role === 'admin') && p.ativo
        );
        setTodosMoradores(apenasMoradoresAtivos);
      }

      if (funcasRes.error || !funcasRes.data) return;

      const atribMap: Record<string, FuncaAtribuicao[]> = {};
      (atribData as any[])?.forEach((a) => {
        if (!atribMap[a.funca_id]) atribMap[a.funca_id] = [];
        atribMap[a.funca_id].push({
          ...a,
          morador: profilesMap[a.morador_id] || null,
          autor_atribuicao: a.atribuido_por ? profilesMap[a.atribuido_por] || null : null,
          alvo_troca: a.troca_solicitada_para ? profilesMap[a.troca_solicitada_para] || null : null,
        });
      });

      const formatadas: Funca[] = (funcasRes.data as any[]).map((f) => ({
        ...f,
        relator: profilesMap[f.relator_id] || null,
        atribuicoes: atribMap[f.id] || [],
      }));

      setFuncas(formatadas);
    } catch (err) {
      console.error('[FuncasScreen] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Realtime para funcas e funca_atribuicoes com debounce de 800ms
  useEffect(() => {
    const triggerDebounced = () => {
      if (funcasDebounceRef.current) clearTimeout(funcasDebounceRef.current);
      funcasDebounceRef.current = setTimeout(() => {
        carregarDados();
      }, 800);
    };

    const channel = supabase
      .channel('funcas-realtime-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcas' }, triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funca_atribuicoes' }, triggerDebounced)
      .subscribe();

    return () => {
      if (funcasDebounceRef.current) clearTimeout(funcasDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [carregarDados]);

  // Se veio de FrentesScreen com initialFrontId, ajusta aba e filtro
  useEffect(() => {
    if (initialFrontId) {
      setFiltroFrente(initialFrontId);
      setAbaAtiva('todas');
    }
  }, [initialFrontId]);

  // -------------------------------------------------------------
  // AÇÕES: STATUS MANUAL EM 3 ETAPAS
  // -------------------------------------------------------------
  const handleAvancarStatus = async (funca: Funca) => {
    const proximo = obterProximoStatusManual(funca.status);
    if (!proximo) return;

    // Atualização otimista
    setFuncas((prev) =>
      prev.map((f) => (f.id === funca.id ? { ...f, status: proximo } : f))
    );

    const { error } = await supabase
      .from('funcas')
      .update({ status: proximo })
      .eq('id', funca.id);

    if (error) {
      alert('Erro ao atualizar status: ' + error.message);
      carregarDados();
    }
  };

  // -------------------------------------------------------------
  // AÇÕES: AUTOATRIBUIÇÃO ("Puxar p/ mim")
  // -------------------------------------------------------------
  const handleAutoatribuir = async (funca: Funca) => {
    if (!user || !profile) return;

    const check = verificarPermissaoAtribuicao({
      autor: profile,
      alvo: profile,
      frenteId: funca.frente_id,
      membrosFrentes,
    });

    if (!check.permitido || !check.tipoAtribuicao) {
      alert(check.motivo || 'Você não tem permissão para puxar esta funça.');
      return;
    }

    const { error } = await supabase.from('funca_atribuicoes').insert({
      funca_id: funca.id,
      morador_id: user.id,
      atribuido_por: user.id,
      tipo_atribuicao: check.tipoAtribuicao,
    });

    if (error) {
      alert('Erro ao se autoatribuir: ' + error.message);
    } else {
      carregarDados();
    }
  };

  // -------------------------------------------------------------
  // AÇÕES: ATRIBUIR A OUTRO MORADOR (MODAL RÁPIDO)
  // -------------------------------------------------------------
  const handleAtribuirTerceiro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !modalAtribuir || !alvoAtribuirId) return;

    const alvo = todosMoradores.find((m) => m.id === alvoAtribuirId);
    if (!alvo) return;

    const check = verificarPermissaoAtribuicao({
      autor: profile,
      alvo,
      frenteId: modalAtribuir.frente_id,
      membrosFrentes,
      modoReuniao: abaAtiva === 'reuniao',
    });

    if (!check.permitido || !check.tipoAtribuicao) {
      alert(check.motivo || 'Você não tem permissão para atribuir a este morador.');
      return;
    }

    const { error } = await supabase.from('funca_atribuicoes').insert({
      funca_id: modalAtribuir.id,
      morador_id: alvoAtribuirId,
      atribuido_por: user.id,
      tipo_atribuicao: check.tipoAtribuicao,
    });

    if (error) {
      alert('Erro ao atribuir morador: ' + error.message);
    } else {
      setModalAtribuir(null);
      setAlvoAtribuirId('');
      carregarDados();
    }
  };

  // -------------------------------------------------------------
  // AÇÕES: REMOÇÃO DE RESPONSÁVEL (Admin, Líder ou Veterano)
  // -------------------------------------------------------------
  const handleRemoverResponsavel = async (funca: Funca, atribuicao: FuncaAtribuicao) => {
    const nome = obterApelidoMorador(atribuicao.morador);
    if (!confirm(`Deseja remover ${nome} da funça "${funca.titulo}"?`)) return;

    const { error } = await supabase
      .from('funca_atribuicoes')
      .delete()
      .match({ funca_id: funca.id, morador_id: atribuicao.morador_id });

    if (error) {
      alert('Erro ao remover responsável: ' + error.message);
    } else {
      carregarDados();
    }
  };

  // -------------------------------------------------------------
  // AÇÕES: SOLICITAÇÃO DE TROCA ENTRE MORADORES
  // -------------------------------------------------------------
  const handleSolicitarTroca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !modalTroca || !alvoTrocaId) return;

    const { error } = await supabase
      .from('funca_atribuicoes')
      .update({
        troca_solicitada_para: alvoTrocaId,
        troca_solicitada_em: new Date().toISOString(),
      })
      .match({ funca_id: modalTroca.funcaId, morador_id: modalTroca.moradorOrigemId });

    if (error) {
      alert('Erro ao solicitar troca: ' + error.message);
    } else {
      setModalTroca(null);
      setAlvoTrocaId('');
      carregarDados();
    }
  };

  const handleCancelarTroca = async (funcaId: string, moradorOrigemId: string) => {
    const { error } = await supabase
      .from('funca_atribuicoes')
      .update({
        troca_solicitada_para: null,
        troca_solicitada_em: null,
      })
      .match({ funca_id: funcaId, morador_id: moradorOrigemId });

    if (error) {
      alert('Erro ao cancelar solicitação: ' + error.message);
    } else {
      carregarDados();
    }
  };

  const handleAceitarTroca = async (funcaId: string, moradorOrigemId: string) => {
    if (!user) return;

    // Tenta primeiro via RPC aceitar_troca_funca
    const { error: rpcError } = await supabase.rpc('aceitar_troca_funca', {
      p_funca_id: funcaId,
      p_morador_origem_id: moradorOrigemId,
    });

    if (rpcError) {
      // Fallback client-side caso a RPC ainda não esteja disponível no banco
      const { error: delError } = await supabase
        .from('funca_atribuicoes')
        .delete()
        .match({ funca_id: funcaId, morador_id: moradorOrigemId });

      if (!delError) {
        await supabase.from('funca_atribuicoes').insert({
          funca_id: funcaId,
          morador_id: user.id,
          atribuido_por: moradorOrigemId,
          tipo_atribuicao: 'troca',
        });
      }
    }

    carregarDados();
  };

  const handleRecusarTroca = async (funcaId: string, moradorOrigemId: string) => {
    const { error } = await supabase
      .from('funca_atribuicoes')
      .update({
        troca_solicitada_para: null,
        troca_solicitada_em: null,
      })
      .match({ funca_id: funcaId, morador_id: moradorOrigemId });

    if (error) {
      alert('Erro ao recusar troca: ' + error.message);
    } else {
      carregarDados();
    }
  };

  // -------------------------------------------------------------
  // AÇÕES: CRIAÇÃO RÁPIDA EM LOTE (REUNIÃO SEMANAL)
  // -------------------------------------------------------------
  const handleAddLinhaLote = () => {
    setLinhasLote((prev) => [
      ...prev,
      {
        id: `linha-${Date.now()}`,
        titulo: '',
        frenteId: null,
        prazo: '',
        responsaveisIds: [],
      },
    ]);
  };

  const handleRemoveLinhaLote = (id: string) => {
    setLinhasLote((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const handleLinhaChange = (
    id: string,
    field: 'titulo' | 'frenteId' | 'prazo' | 'responsaveisIds',
    value: any
  ) => {
    setLinhasLote((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const handleSalvarLote = async () => {
    if (!user) return;
    const preenchidas = linhasLote.filter((l) => l.titulo.trim() !== '');
    if (preenchidas.length === 0) {
      alert('Preencha ao menos o título de uma funça.');
      return;
    }

    setSalvandoLote(true);
    try {
      for (const linha of preenchidas) {
        // Insere funça
        const { data: novaFunca, error: funcaErr } = await supabase
          .from('funcas')
          .insert({
            relator_id: user.id,
            titulo: linha.titulo.trim(),
            descricao: linha.titulo.trim(), // fallback
            frente_id: linha.frenteId || null,
            prazo: linha.prazo || null,
            status: 'aberta',
          })
          .select()
          .single();

        if (funcaErr || !novaFunca) continue;

        // Insere atribuições com tipo 'reuniao'
        if (linha.responsaveisIds.length > 0) {
          const atribs = linha.responsaveisIds.map((mId) => ({
            funca_id: novaFunca.id,
            morador_id: mId,
            atribuido_por: user.id,
            tipo_atribuicao: 'reuniao',
          }));

          await supabase.from('funca_atribuicoes').insert(atribs);
        }
      }

      // Limpa linhas para novo lote
      setLinhasLote([
        {
          id: `linha-${Date.now()}`,
          titulo: '',
          frenteId: null,
          prazo: '',
          responsaveisIds: [],
        },
      ]);
      await carregarDados();
    } catch (err: any) {
      alert('Erro ao salvar funças em lote: ' + err.message);
    } finally {
      setSalvandoLote(false);
    }
  };

  // Alterações inline de triagem na Reunião Semanal
  const handleAtualizarPrazoInline = async (funcaId: string, novoPrazo: string) => {
    await supabase.from('funcas').update({ prazo: novoPrazo || null }).eq('id', funcaId);
    carregarDados();
  };

  const handleAtualizarFrenteInline = async (funcaId: string, novaFrenteId: string | null) => {
    await supabase.from('funcas').update({ frente_id: novaFrenteId }).eq('id', funcaId);
    carregarDados();
  };

  // -------------------------------------------------------------
  // DADOS FILTRADOS POR ABA
  // -------------------------------------------------------------
  // Pedidos de troca recebidos pelo usuário logado
  const pedidosTrocaRecebidos = funcas.flatMap((f) =>
    f.atribuicoes
      .filter((a) => a.troca_solicitada_para === user?.id)
      .map((a) => ({ funca: f, atribuicao: a }))
  );

  // Minhas funças ativas
  const minhasFuncasAtivas = funcas.filter(
    (f) =>
      f.status !== 'concluida' &&
      f.atribuicoes.some((a) => a.morador_id === user?.id)
  );

  // Minhas funças concluídas
  const minhasFuncasConcluidas = funcas.filter(
    (f) =>
      f.status === 'concluida' &&
      f.atribuicoes.some((a) => a.morador_id === user?.id)
  );

  // Todas as funças (com filtros de frente e status)
  const funcasFiltradasTodas = funcas.filter((f) => {
    if (filtroFrente !== null && f.frente_id !== filtroFrente) return false;
    if (filtroStatus === 'pendentes' && f.status === 'concluida') return false;
    if (filtroStatus === 'concluidas' && f.status !== 'concluida') return false;
    return true;
  });

  // Funças para a triagem da Reunião Semanal
  const funcasPendentesReuniao = funcas.filter((f) => f.status !== 'concluida');
  const funcasTriagemReuniao = filtroReuniaoSemDono
    ? funcasPendentesReuniao.filter((f) => f.atribuicoes.length === 0)
    : funcasPendentesReuniao;

  return (
    <>
      <PageTitle
        title="Funças"
        hint="Tarefas, reparos e missões da república"
        back={{
          label: 'Casa',
          onClick: () => {
            if (onClearInitialFront) onClearInitialFront();
            onBack();
          },
        }}
        action={
          <Button onClick={() => setModalNovaAberto(true)}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>Nova</span>
            </span>
          </Button>
        }
      />

      {/* ABAS SUPERIORES */}
      <div className="flex border-b border-line mb-5 gap-1 text-sm font-medium">
        <button
          onClick={() => setAbaAtiva('minhas')}
          className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            abaAtiva === 'minhas'
              ? 'border-forest text-forest font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <span>Minhas</span>
          {minhasFuncasAtivas.length > 0 && (
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-forest text-white">
              {minhasFuncasAtivas.length}
            </span>
          )}
          {pedidosTrocaRecebidos.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-clay animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setAbaAtiva('todas')}
          className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            abaAtiva === 'todas'
              ? 'border-forest text-forest font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <span>Todas</span>
          <span className="text-[11px] text-muted">
            ({funcas.filter((f) => f.status !== 'concluida').length})
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva('reuniao')}
          className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            abaAtiva === 'reuniao'
              ? 'border-forest text-forest font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-forest" />
          <span>Reunião Semanal</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">Carregando funças da casa...</div>
      ) : (
        <>
          {/* ========================================================= */}
          {/* ABA 1: MINHAS                                             */}
          {/* ========================================================= */}
          {abaAtiva === 'minhas' && (
            <div className="space-y-6 pb-12">
              {/* BANNER DE PEDIDOS DE TROCA RECEBIDOS */}
              {pedidosTrocaRecebidos.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-clay flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Pedidos de Troca Recebidos ({pedidosTrocaRecebidos.length})
                  </h3>
                  {pedidosTrocaRecebidos.map(({ funca, atribuicao }) => {
                    const solicitanteNome = obterApelidoMorador(atribuicao.morador);
                    return (
                      <div
                        key={funca.id + atribuicao.morador_id}
                        className="p-3.5 rounded-xl border border-clay/30 bg-clay-tint/40 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs text-clay font-medium">
                              <strong>{solicitanteNome}</strong> pediu para trocar de funça com você:
                            </p>
                            <h4 className="text-sm font-bold text-ink mt-0.5">{funca.titulo}</h4>
                            <p className="text-[11px] text-muted mt-0.5">
                              {funca.frente ? `Frente: ${funca.frente.nome}` : 'Funça Geral'}
                              {funca.prazo && ` · Prazo: ${funca.prazo}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="primary"
                            onClick={() => handleAceitarTroca(funca.id, atribuicao.morador_id)}
                          >
                            Aceitar Troca
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleRecusarTroca(funca.id, atribuicao.morador_id)}
                          >
                            Recusar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LISTA DE MINHAS FUNÇAS ATIVAS */}
              <div>
                <h3 className="text-xs font-medium text-muted mb-2">
                  Atribuídas a você ({minhasFuncasAtivas.length})
                </h3>

                {minhasFuncasAtivas.length === 0 ? (
                  <div className="p-4 rounded-xl border border-line bg-surface text-center">
                    <p className="text-sm font-semibold text-ink">Nenhuma funça atribuída a você</p>
                    <p className="text-xs text-muted mt-0.5">
                      Você pode puxar funças abertas na aba &quot;Todas&quot; ou aguardar a reunião.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {minhasFuncasAtivas.map((f) => {
                      const minhaAtribuicao = f.atribuicoes.find((a) => a.morador_id === user?.id);
                      const temTrocaPendente = !!minhaAtribuicao?.troca_solicitada_para;
                      const alvoTrocaNome = minhaAtribuicao?.alvo_troca
                        ? obterApelidoMorador(minhaAtribuicao.alvo_troca)
                        : 'outro morador';

                      return (
                        <div
                          key={f.id}
                          className="p-4 rounded-xl border border-line bg-surface shadow-2xs space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Tag tone={f.status === 'em_andamento' ? 'green' : 'neutral'}>
                                  {f.status === 'aberta' ? 'Aberta' : 'Em andamento'}
                                </Tag>
                                <Tag tone="neutral">{f.frente ? f.frente.nome : 'Geral'}</Tag>
                                {f.prazo && (
                                  <span className="text-[11px] text-muted flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {f.prazo}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-base font-semibold text-ink leading-snug">
                                {f.titulo}
                              </h4>
                              {f.descricao && (
                                <p className="text-xs text-muted mt-1 leading-relaxed">
                                  {f.descricao}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Foto opcional */}
                          {f.foto_url && (
                            <div className="aspect-video w-full max-h-36 rounded-lg overflow-hidden border border-line bg-paper">
                              <img
                                src={f.foto_url}
                                alt="Foto da funça"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          {/* Criada por & Responsáveis */}
                          <div className="space-y-1 text-xs text-muted">
                            <div>
                              <span className="font-medium text-ink">Criada por: </span>
                              <span className="text-ink/80">{obterApelidoMorador(f.relator)}</span>
                            </div>
                            <div>
                              <span className="font-medium text-ink">Responsáveis: </span>
                              <span>{f.atribuicoes.map((a) => obterApelidoMorador(a.morador)).join(', ')}</span>
                            </div>
                          </div>

                          {/* Status de Troca Enviada */}
                          {temTrocaPendente && (
                            <div className="p-2.5 rounded-lg bg-cream/70 border border-line text-xs flex items-center justify-between gap-2">
                              <span className="text-muted">
                                Pedido de troca enviado para{' '}
                                <strong className="text-ink">{alvoTrocaNome}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCancelarTroca(f.id, user!.id)}
                                className="text-clay font-medium hover:underline text-[11px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}

                          {/* Barra de Ações: Avanço Manual + Pedir Troca */}
                          <div className="pt-1 flex items-center justify-between gap-2 border-t border-line/60">
                            <div>
                              {!temTrocaPendente && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModalTroca({
                                      funcaId: f.id,
                                      moradorOrigemId: user!.id,
                                    })
                                  }
                                  className="text-xs text-muted hover:text-ink font-medium flex items-center gap-1 py-1"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                  <span>Pedir Troca</span>
                                </button>
                              )}
                            </div>

                            <div>
                              {f.status === 'aberta' ? (
                                <Button variant="outline" onClick={() => handleAvancarStatus(f)}>
                                  <span className="flex items-center gap-1.5">
                                    <Play className="w-3.5 h-3.5 text-forest" />
                                    <span>Iniciar (Em andamento)</span>
                                  </span>
                                </Button>
                              ) : (
                                <Button variant="primary" onClick={() => handleAvancarStatus(f)}>
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Concluir Funça</span>
                                  </span>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* HISTÓRICO DE CONCLUÍDAS POR MIM */}
              {minhasFuncasConcluidas.length > 0 && (
                <div className="pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setVerConcluidasMinhas((v) => !v)}
                    className="w-full text-left flex items-center justify-between text-xs text-muted py-2 hover:text-ink"
                  >
                    <span>Concluídas por você ({minhasFuncasConcluidas.length})</span>
                    <span>{verConcluidasMinhas ? 'Recolher ▲' : 'Ver histórico ▼'}</span>
                  </button>

                  {verConcluidasMinhas && (
                    <div className="space-y-2 mt-2">
                      {minhasFuncasConcluidas.map((f) => (
                        <div
                          key={f.id}
                          className="p-3 rounded-xl border border-line bg-surface/60 opacity-80 flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-ink line-through">{f.titulo}</p>
                            <p className="text-[11px] text-muted">
                              {f.frente ? f.frente.nome : 'Geral'} · Criada por {obterApelidoMorador(f.relator)}
                            </p>
                          </div>
                          <Tag tone="green">Concluída</Tag>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 2: TODAS (DA CASA & FRENTES)                          */}
          {/* ========================================================= */}
          {abaAtiva === 'todas' && (
            <div className="space-y-4 pb-12">
              {/* FILTROS */}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={filtroFrente || ''}
                  onChange={(e) => setFiltroFrente(e.target.value ? e.target.value : null)}
                  className="px-3 py-2 rounded-xl border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest flex-1"
                >
                  <option value="">Todas as frentes e gerais</option>
                  <option value="__geral__">Apenas Funças Gerais (Sem frente)</option>
                  {frentes.map((f) => (
                    <option key={f.id} value={f.id}>
                      Frente: {f.nome}
                    </option>
                  ))}
                </select>

                <div className="flex gap-1 bg-surface p-1 rounded-xl border border-line shrink-0">
                  <button
                    type="button"
                    onClick={() => setFiltroStatus('pendentes')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filtroStatus === 'pendentes'
                        ? 'bg-forest text-white'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Pendentes
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroStatus('concluidas')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filtroStatus === 'concluidas'
                        ? 'bg-forest text-white'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Concluídas
                  </button>
                </div>
              </div>

              {/* LISTA */}
              {funcasFiltradasTodas.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted border border-line rounded-xl bg-surface">
                  Nenhuma funça encontrada com os filtros selecionados.
                </div>
              ) : (
                <div className="space-y-3">
                  {funcasFiltradasTodas.map((f) => {
                    const jaSouResponsavel = f.atribuicoes.some((a) => a.morador_id === user?.id);
                    const podeAutoatribuir =
                      !jaSouResponsavel &&
                      f.status !== 'concluida' &&
                      profile &&
                      verificarPermissaoAtribuicao({
                        autor: profile,
                        alvo: profile,
                        frenteId: f.frente_id,
                        membrosFrentes,
                      }).permitido;

                    const podeAtribuirTerceiro =
                      f.status !== 'concluida' &&
                      profile &&
                      todosMoradores.some((alvo) => {
                        if (f.atribuicoes.some((a) => a.morador_id === alvo.id)) return false;
                        return verificarPermissaoAtribuicao({
                          autor: profile,
                          alvo,
                          frenteId: f.frente_id,
                          membrosFrentes,
                        }).permitido;
                      });

                    const podeAvancar =
                      f.status !== 'concluida' &&
                      profile &&
                      podeAvancarStatusFunca({
                        usuario: profile,
                        funca: f,
                        atribuicoes: f.atribuicoes,
                        membrosFrentes,
                      });

                    return (
                      <div
                        key={f.id}
                        className="p-4 rounded-xl border border-line bg-surface shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Tag tone={f.status === 'concluida' ? 'green' : f.status === 'em_andamento' ? 'green' : 'neutral'}>
                                {f.status === 'aberta'
                                  ? 'Aberta'
                                  : f.status === 'em_andamento'
                                  ? 'Em andamento'
                                  : 'Concluída'}
                              </Tag>
                              <Tag tone="neutral">{f.frente ? f.frente.nome : 'Geral'}</Tag>
                              {f.prazo && (
                                <span className="text-[11px] text-muted flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {f.prazo}
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-semibold text-ink leading-snug">
                              {f.titulo}
                            </h4>
                            {f.descricao && (
                              <p className="text-xs text-muted mt-1 leading-relaxed">
                                {f.descricao}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Foto opcional */}
                        {f.foto_url && (
                          <div className="aspect-video w-full max-h-36 rounded-lg overflow-hidden border border-line bg-paper">
                            <img
                              src={f.foto_url}
                              alt="Foto da funça"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {/* Criada por & Responsáveis com controle de remoção por quem tem direito */}
                        <div className="space-y-1.5 text-xs">
                          <div className="text-muted">
                            <span className="font-medium text-ink">Criada por: </span>
                            <span className="text-ink/80">{obterApelidoMorador(f.relator)}</span>
                          </div>
                          <div>
                            <span className="font-medium text-ink">Responsáveis: </span>
                            {f.atribuicoes.length === 0 ? (
                              <span className="text-clay font-medium italic">Sem dono (Aguardando alocação)</span>
                            ) : (
                              <div className="inline-flex flex-wrap gap-1 mt-1">
                              {f.atribuicoes.map((a) => {
                                const nome = obterApelidoMorador(a.morador);
                                const podeRemover =
                                  profile &&
                                  podeRemoverResponsavel({
                                    usuario: profile,
                                    atribuicao: a,
                                    frenteId: f.frente_id,
                                    membrosFrentes,
                                  });

                                return (
                                  <span
                                    key={a.morador_id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-paper border border-line text-ink text-[11px]"
                                  >
                                    <span>{nome}</span>
                                    {podeRemover && (
                                      <button
                                        type="button"
                                        title="Remover responsável"
                                        onClick={() => handleRemoverResponsavel(f, a)}
                                        className="text-muted hover:text-clay ml-0.5"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                        {/* Ações inferiores */}
                        {f.status !== 'concluida' && (
                          <div className="pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {podeAutoatribuir && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoatribuir(f)}
                                  className="text-xs text-forest hover:bg-mint px-2.5 py-1.5 rounded-lg border border-line transition-colors flex items-center gap-1"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Puxar p/ mim</span>
                                </button>
                              )}

                              {podeAtribuirTerceiro && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalAtribuir(f);
                                    setAlvoAtribuirId('');
                                  }}
                                  className="text-xs text-muted hover:text-ink px-2.5 py-1.5 rounded-lg border border-line transition-colors flex items-center gap-1"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                  <span>+ Atribuir</span>
                                </button>
                              )}
                            </div>

                            {podeAvancar && (
                              <div>
                                {f.status === 'aberta' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleAvancarStatus(f)}
                                    className="text-xs text-forest hover:text-forest-dark font-medium flex items-center gap-1"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    <span>Iniciar</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAvancarStatus(f)}
                                    className="text-xs text-forest hover:text-forest-dark font-medium flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Concluir</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 3: REUNIÃO SEMANAL (TRIAGEM & LANÇAMENTO EM LOTE)      */}
          {/* ========================================================= */}
          {abaAtiva === 'reuniao' && (
            <div className="space-y-6 pb-12">
              {/* BLOCO 1: PLANILHA DINÂMICA DE CRIAÇÃO RÁPIDA EM LOTE */}
              <div className="p-4 rounded-2xl border border-line bg-surface shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-forest" />
                      Lançamento Rápido na Reunião
                    </h3>
                    <p className="text-xs text-muted">
                      Cadastre múltiplas tarefas deliberadas na reunião de uma só vez
                    </p>
                  </div>
                  <Button variant="outline" onClick={handleAddLinhaLote}>
                    + Linha
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {linhasLote.map((linha, index) => (
                    <div
                      key={linha.id}
                      className="p-3 rounded-xl border border-line bg-paper/60 space-y-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-muted w-4">{index + 1}.</span>
                        <input
                          type="text"
                          value={linha.titulo}
                          onChange={(e) => handleLinhaChange(linha.id, 'titulo', e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddLinhaLote();
                            }
                          }}
                          placeholder="Título da funça (pressione Enter para nova linha)"
                          className="flex-1 px-3 py-2 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest"
                        />
                        {linhasLote.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLinhaLote(linha.id)}
                            className="p-1.5 text-muted hover:text-clay"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        {/* Escopo */}
                        <select
                          value={linha.frenteId || ''}
                          onChange={(e) =>
                            handleLinhaChange(
                              linha.id,
                              'frenteId',
                              e.target.value ? e.target.value : null
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest"
                        >
                          <option value="">Geral (Casa toda)</option>
                          {frentes.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.nome}
                            </option>
                          ))}
                        </select>

                        {/* Prazo */}
                        <input
                          type="date"
                          value={linha.prazo}
                          onChange={(e) => handleLinhaChange(linha.id, 'prazo', e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest"
                        />

                        {/* Responsável rápido */}
                        <select
                          value={linha.responsaveisIds[0] || ''}
                          onChange={(e) =>
                            handleLinhaChange(
                              linha.id,
                              'responsaveisIds',
                              e.target.value ? [e.target.value] : []
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest"
                        >
                          <option value="">Sem responsável inicial</option>
                          {todosMoradores
                            .filter((m) => m.role === 'morador' || m.role === 'admin')
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {obterApelidoMorador(m)} ({m.geracao || '025'})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-end">
                  <Button onClick={handleSalvarLote} disabled={salvandoLote}>
                    {salvandoLote ? 'Salvando...' : `Lançar ${linhasLote.filter((l) => l.titulo.trim()).length} funça(s)`}
                  </Button>
                </div>
              </div>

              {/* BLOCO 2: FILA DE TRIAGEM DE FUNÇAS PENDENTES */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                      Triagem e Alocação Coletiva
                    </h3>
                    <p className="text-xs text-muted">Defina donos e prazos para as tarefas pendentes</p>
                  </div>

                  <div className="flex gap-1 bg-surface p-1 rounded-xl border border-line text-xs">
                    <button
                      type="button"
                      onClick={() => setFiltroReuniaoSemDono(true)}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        filtroReuniaoSemDono ? 'bg-forest text-white font-medium' : 'text-muted'
                      }`}
                    >
                      Sem dono ({funcasPendentesReuniao.filter((f) => f.atribuicoes.length === 0).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroReuniaoSemDono(false)}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        !filtroReuniaoSemDono ? 'bg-forest text-white font-medium' : 'text-muted'
                      }`}
                    >
                      Todas ({funcasPendentesReuniao.length})
                    </button>
                  </div>
                </div>

                {funcasTriagemReuniao.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted border border-line rounded-xl bg-surface">
                    {filtroReuniaoSemDono
                      ? 'Nenhuma funça sem responsável no momento! Todas estão alocadas.'
                      : 'Nenhuma funça pendente na casa.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {funcasTriagemReuniao.map((f) => (
                      <div
                        key={f.id}
                        className="p-4 rounded-xl border border-line bg-surface shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-ink">{f.titulo}</h4>
                            <p className="text-[11px] text-muted mt-0.5">
                              Criada por: <strong className="font-medium text-ink">{obterApelidoMorador(f.relator)}</strong>
                            </p>
                            {f.descricao && (
                              <p className="text-xs text-muted mt-0.5">{f.descricao}</p>
                            )}
                          </div>
                          <Tag tone={f.atribuicoes.length === 0 ? 'alert' : 'green'}>
                            {f.atribuicoes.length === 0 ? 'Sem dono' : `${f.atribuicoes.length} dono(s)`}
                          </Tag>
                        </div>

                        {/* Controles inline de triagem rápida */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                          {/* Troca de Frente inline */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1">
                              Frente / Escopo
                            </label>
                            <select
                              value={f.frente_id || ''}
                              onChange={(e) =>
                                handleAtualizarFrenteInline(f.id, e.target.value ? e.target.value : null)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper text-ink text-xs"
                            >
                              <option value="">Geral</option>
                              {frentes.map((fr) => (
                                <option key={fr.id} value={fr.id}>
                                  {fr.nome}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Prazo inline */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1">
                              Prazo deliberado
                            </label>
                            <input
                              type="date"
                              value={f.prazo || ''}
                              onChange={(e) => handleAtualizarPrazoInline(f.id, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper text-ink text-xs"
                            />
                          </div>

                          {/* Alocar responsável rápido */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1">
                              + Alocar Responsável
                            </label>
                            <select
                              defaultValue=""
                              onChange={async (e) => {
                                const mId = e.target.value;
                                if (!mId || !user) return;
                                await supabase.from('funca_atribuicoes').insert({
                                  funca_id: f.id,
                                  morador_id: mId,
                                  atribuido_por: user.id,
                                  tipo_atribuicao: 'reuniao',
                                });
                                carregarDados();
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper text-ink text-xs"
                            >
                              <option value="">Selecione para adicionar...</option>
                              {todosMoradores
                                .filter(
                                  (m) =>
                                    (m.role === 'morador' || m.role === 'admin') &&
                                    !f.atribuicoes.some((a) => a.morador_id === m.id)
                                )
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {obterApelidoMorador(m)} ({m.geracao || '025'})
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>

                        {/* Badges de responsáveis atribuídos com remoção */}
                        {f.atribuicoes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-line/60">
                            {f.atribuicoes.map((a) => (
                              <span
                                key={a.morador_id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-mint/50 border border-forest/30 text-forest text-xs font-medium"
                              >
                                <span>{obterApelidoMorador(a.morador)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoverResponsavel(f, a)}
                                  className="text-muted hover:text-clay ml-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: ABERTURA DE NOVA FUNÇA INDIVIDUAL */}
      <NovaFuncaModal
        isOpen={modalNovaAberto}
        onClose={() => setModalNovaAberto(false)}
        onSuccess={() => {
          carregarDados();
          setModalNovaAberto(false);
        }}
        frentes={frentes}
        membrosFrentes={membrosFrentes}
        todosMoradores={todosMoradores}
        initialFrontId={filtroFrente}
      />

      {/* MODAL: PEDIR TROCA DE FUNÇA */}
      {modalTroca && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-forest" />
                Pedir Troca de Funça
              </h3>
              <button
                type="button"
                onClick={() => setModalTroca(null)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Escolha para qual morador da casa você deseja passar esta funça. Ele receberá uma
              notificação e precisará aceitar para efetivar a troca.
            </p>

            <form onSubmit={handleSolicitarTroca} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Selecione o Morador Destinatário
                </label>
                <select
                  required
                  value={alvoTrocaId}
                  onChange={(e) => setAlvoTrocaId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                >
                  <option value="">Selecione um morador...</option>
                  {todosMoradores
                    .filter(
                      (m) =>
                        (m.role === 'morador' || m.role === 'admin') &&
                        m.id !== user?.id
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {obterApelidoMorador(m)} — Geração {m.geracao || '025'}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  full
                  onClick={() => setModalTroca(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" full disabled={!alvoTrocaId}>
                  Enviar Pedido
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ATRIBUIR RESPONSÁVEL RÁPIDO (ABA TODAS) */}
      {modalAtribuir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-forest" />
                Atribuir Responsável
              </h3>
              <button
                type="button"
                onClick={() => setModalAtribuir(null)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Atribuir à funça: <strong>{modalAtribuir.titulo}</strong>
            </p>

            <form onSubmit={handleAtribuirTerceiro} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Moradores autorizados pela sua alçada
                </label>
                <select
                  required
                  value={alvoAtribuirId}
                  onChange={(e) => setAlvoAtribuirId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                >
                  <option value="">Selecione um morador...</option>
                  {todosMoradores
                    .filter((m) => {
                      if (!profile) return false;
                      if (m.role !== 'morador' && m.role !== 'admin') return false;
                      if (modalAtribuir.atribuicoes.some((a) => a.morador_id === m.id))
                        return false;
                      const check = verificarPermissaoAtribuicao({
                        autor: profile,
                        alvo: m,
                        frenteId: modalAtribuir.frente_id,
                        membrosFrentes,
                      });
                      return check.permitido;
                    })
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {obterApelidoMorador(m)} — Geração {m.geracao || '025'}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  full
                  onClick={() => setModalAtribuir(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" full disabled={!alvoAtribuirId}>
                  Confirmar Atribuição
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
