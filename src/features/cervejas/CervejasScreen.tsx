import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { PageTitle, Button, Tag } from '../../components/ui';
import {
  Beer,
  AlertCircle,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  PlusCircle,
  Check,
} from 'lucide-react';
import type {
  CaixaCerveja,
  CervejasTab,
  MoradorResumoCerveja,
} from '../../types/cervejas';
import {
  calcularResumoCaixas,
  agruparCaixasPorMorador,
  obterHistoricoCaixasPagas,
  obterCaixasComSolicitacao,
  obterApelidoMorador,
  validarLancamentoManual,
  MOTIVOS_TRADICAO_SUGESTOES,
} from '../../types/cervejas';

interface CervejasScreenProps {
  onBack: () => void;
}

export const CervejasScreen: React.FC<CervejasScreenProps> = ({ onBack }) => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<CervejasTab>('moradores');
  const [loading, setLoading] = useState(true);
  const [caixas, setCaixas] = useState<CaixaCerveja[]>([]);
  const [moradoresAtivos, setMoradoresAtivos] = useState<MoradorResumoCerveja[]>([]);
  const [expandedMoradorIds, setExpandedMoradorIds] = useState<Set<string>>(new Set());

  // Estado do Modal de Lançamento Manual (Exclusivo Admin)
  const [modalLancamentoOpen, setModalLancamentoOpen] = useState(false);
  const [moradorSelecionadoId, setMoradorSelecionadoId] = useState('');
  const [motivoDescricao, setMotivoDescricao] = useState('');
  const [dataAtribuicao, setDataAtribuicao] = useState(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  });
  const [salvandoLancamento, setSalvandoLancamento] = useState(false);
  const [erroLancamento, setErroLancamento] = useState<string | null>(null);

  // Carregamento de dados (Moradores e Caixas)
  const carregarDados = useCallback(async () => {
    try {
      // 1. Carrega todos os perfis para auditoria e mapeamento de apelidos
      const { data: allProfilesData } = await supabase
        .from('profiles')
        .select('id, nome, apelido, geracao, role, ativo, quarto:rooms(nome)');

      const perfisMap = new Map<string, MoradorResumoCerveja>();
      (allProfilesData || []).forEach((p: any) => {
        perfisMap.set(p.id, {
          id: p.id,
          nome: p.nome,
          apelido: p.apelido,
          geracao: p.geracao,
          quarto: p.quarto,
          role: p.role,
        });
      });

      // 2. Filtra estritamente moradores da república (role !== 'externo' e ativo = true)
      // Exclui agregados / convidados externos
      const moradoresAtivosList: MoradorResumoCerveja[] = (allProfilesData || [])
        .filter((p: any) => p.ativo === true && p.role !== 'externo')
        .map((p: any) => ({
          id: p.id,
          nome: p.nome,
          apelido: p.apelido,
          geracao: p.geracao,
          quarto: p.quarto,
          role: p.role,
        }))
        .sort((a, b) => {
          const apelidoA = a.apelido || a.nome;
          const apelidoB = b.apelido || b.nome;
          return apelidoA.localeCompare(apelidoB, 'pt-BR');
        });
      setMoradoresAtivos(moradoresAtivosList);

      // 3. Carrega todas as caixas de cerveja
      const { data: caixasData, error: caixasError } = await supabase
        .from('caixas_cerveja')
        .select('*')
        .order('created_at', { ascending: false });

      if (caixasError) {
        console.error('[CervejasScreen] Erro ao carregar caixas:', caixasError);
        return;
      }

      const caixasFormatadas: CaixaCerveja[] = (caixasData || [])
        .map((c: any) => ({
          ...c,
          morador: perfisMap.get(c.morador_id) || null,
          admin_baixa: c.baixada_por ? perfisMap.get(c.baixada_por) || null : null,
        }))
        // Garante que eventuais caixas associadas a agregados não apareçam
        .filter((c: CaixaCerveja) => c.morador?.role !== 'externo');

      setCaixas(caixasFormatadas);
    } catch (err) {
      console.error('[CervejasScreen] Erro inesperado:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('caixas-cerveja-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caixas_cerveja' },
        () => carregarDados()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarDados]);

  // Atualiza seleção padrão do morador no modal quando a lista for carregada
  useEffect(() => {
    if (!moradorSelecionadoId && moradoresAtivos.length > 0) {
      setMoradorSelecionadoId(moradoresAtivos[0].id);
    }
  }, [moradorSelecionadoId, moradoresAtivos]);

  // Expansão/recolhimento de morador
  const toggleExpansaoMorador = (moradorId: string) => {
    setExpandedMoradorIds((prev) => {
      const next = new Set(prev);
      if (next.has(moradorId)) {
        next.delete(moradorId);
      } else {
        next.add(moradorId);
      }
      return next;
    });
  };

  // Solicitar Baixa (Morador devedor)
  const handleSolicitarBaixa = async (caixaId: string) => {
    try {
      const { error } = await supabase
        .from('caixas_cerveja')
        .update({
          status: 'baixa_solicitada',
          solicitada_em: new Date().toISOString(),
        })
        .eq('id', caixaId);

      if (error) {
        alert('Erro ao solicitar baixa: ' + error.message);
      } else {
        await carregarDados();
      }
    } catch (err: any) {
      alert('Erro inesperado: ' + err.message);
    }
  };

  // Confirmar Baixa / Baixa Direta (Admin)
  const handleAprovarBaixa = async (caixaId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('caixas_cerveja')
        .update({
          status: 'paga',
          baixada_em: new Date().toISOString(),
          baixada_por: user.id,
        })
        .eq('id', caixaId);

      if (error) {
        alert('Erro ao confirmar baixa: ' + error.message);
      } else {
        await carregarDados();
      }
    } catch (err: any) {
      alert('Erro inesperado: ' + err.message);
    }
  };

  // Recusar / Devolver solicitação de baixa para pendente (Admin)
  const handleRecusarSolicitacao = async (caixaId: string) => {
    try {
      const { error } = await supabase
        .from('caixas_cerveja')
        .update({
          status: 'pendente',
          solicitada_em: null,
        })
        .eq('id', caixaId);

      if (error) {
        alert('Erro ao recusar solicitação: ' + error.message);
      } else {
        await carregarDados();
      }
    } catch (err: any) {
      alert('Erro inesperado: ' + err.message);
    }
  };

  // Excluir registro / Estorno de lançamento equivocado (Admin)
  const handleExcluirCaixa = async (caixaId: string) => {
    if (!confirm('Deseja estornar e excluir definitivamente este registro de caixa?')) {
      return;
    }
    try {
      const { error } = await supabase
        .from('caixas_cerveja')
        .delete()
        .eq('id', caixaId);

      if (error) {
        alert('Erro ao excluir caixa: ' + error.message);
      } else {
        await carregarDados();
      }
    } catch (err: any) {
      alert('Erro inesperado: ' + err.message);
    }
  };

  // Abrir Modal de Lançamento Manual (opcionalmente com morador pré-selecionado)
  const abrirModalLancamento = (preSelectMoradorId?: string) => {
    setMoradorSelecionadoId(preSelectMoradorId || moradoresAtivos[0]?.id || '');
    setMotivoDescricao('');
    setErroLancamento(null);
    setModalLancamentoOpen(true);
  };

  // Submissão de Lançamento Manual Unitário
  const handleSubmitLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    const validacao = validarLancamentoManual({
      morador_id: moradorSelecionadoId,
      motivo_descricao: motivoDescricao,
      isAdmin,
    });

    if (!validacao.valido) {
      setErroLancamento(validacao.erro || 'Dados inválidos.');
      return;
    }

    setSalvandoLancamento(true);
    setErroLancamento(null);

    try {
      const { error } = await supabase.from('caixas_cerveja').insert({
        morador_id: moradorSelecionadoId,
        motivo_descricao: motivoDescricao.trim(),
        origem: 'manual',
        data_atribuicao: dataAtribuicao,
        status: 'pendente',
      });

      if (error) {
        setErroLancamento('Erro ao salvar lançamento: ' + error.message);
      } else {
        setModalLancamentoOpen(false);
        setMotivoDescricao('');
        await carregarDados();
      }
    } catch (err: any) {
      setErroLancamento('Erro inesperado: ' + err.message);
    } finally {
      setSalvandoLancamento(false);
    }
  };

  // Derivação dos dados
  const resumo = calcularResumoCaixas(caixas, user?.id);
  const moradoresAgrupados = agruparCaixasPorMorador(moradoresAtivos, caixas);
  const historicoPagas = obterHistoricoCaixasPagas(caixas);
  const caixasSolicitadas = obterCaixasComSolicitacao(caixas);

  return (
    <div className="pb-12">
      <PageTitle
        title="Caixas de Cerveja"
        hint="Moradores e caixas unitárias pendentes na casa"
        back={{ label: 'Casa', onClick: onBack }}
        action={
          isAdmin ? (
            <Button onClick={() => abrirModalLancamento()}>+ Lançar</Button>
          ) : undefined
        }
      />

      {/* Cards de Resumo Global */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="p-3 rounded-xl border border-line bg-surface">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">Pendentes</p>
          <p className={`text-xl font-bold mt-0.5 ${resumo.totalPendentesCasa > 0 ? 'text-clay' : 'text-ink'}`}>
            {resumo.totalPendentesCasa}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            {resumo.moradoresDevedoresCount} {resumo.moradoresDevedoresCount === 1 ? 'morador' : 'moradores'}
          </p>
        </div>

        <div className="p-3 rounded-xl border border-line bg-surface">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">Suas</p>
          <p className={`text-xl font-bold mt-0.5 ${resumo.minhasPendentes > 0 ? 'text-clay' : 'text-forest'}`}>
            {resumo.minhasPendentes}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            {resumo.minhasPendentes > 0 ? 'A entregar' : 'Tudo em dia'}
          </p>
        </div>

        <div className="p-3 rounded-xl border border-line bg-surface">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">Entregues</p>
          <p className="text-xl font-bold text-forest mt-0.5">
            {resumo.totalPagasHistorico}
          </p>
          <p className="text-[10px] text-muted mt-0.5">Total quitadas</p>
        </div>
      </div>

      {/* Banner de Alerta para o Admin se houver baixas solicitadas */}
      {isAdmin && resumo.aguardandoConfirmacao > 0 && activeTab !== 'solicitacoes' && (
        <button
          type="button"
          onClick={() => setActiveTab('solicitacoes')}
          className="w-full text-left mb-5 p-3 rounded-xl bg-clay-tint border border-line text-clay text-xs flex items-center justify-between gap-2 shadow-xs hover:bg-clay-tint/80 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              <strong>{resumo.aguardandoConfirmacao}</strong> {resumo.aguardandoConfirmacao === 1 ? 'caixa aguarda' : 'caixas aguardam'} sua confirmação de baixa.
            </span>
          </div>
          <Tag tone="alert">Ver solicitações →</Tag>
        </button>
      )}

      {/* Seletor Segmentado de Abas */}
      <div
        className={`mb-5 p-1 rounded-xl bg-surface border border-line grid ${
          isAdmin ? 'grid-cols-3' : 'grid-cols-2'
        } gap-1`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('moradores')}
          className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all truncate ${
            activeTab === 'moradores'
              ? 'bg-paper text-ink shadow-xs border border-line'
              : 'text-muted hover:text-ink'
          }`}
        >
          Moradores ({moradoresAgrupados.length})
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('solicitacoes')}
            className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 truncate ${
              activeTab === 'solicitacoes'
                ? 'bg-paper text-ink shadow-xs border border-line'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="truncate">Solicitações ({caixasSolicitadas.length})</span>
            {caixasSolicitadas.length > 0 && activeTab !== 'solicitacoes' && (
              <span className="w-2 h-2 rounded-full bg-clay shrink-0" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('historico')}
          className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all truncate ${
            activeTab === 'historico'
              ? 'bg-paper text-ink shadow-xs border border-line'
              : 'text-muted hover:text-ink'
          }`}
        >
          Histórico ({resumo.totalPagasHistorico})
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">
          Carregando moradores e caixas...
        </div>
      ) : activeTab === 'moradores' ? (
        /* ABA 1: LISTA DE MORADORES E ACCORDION DE CAIXAS */
        <div className="space-y-3">
          {moradoresAgrupados.map((item) => {
            const isExpanded = expandedMoradorIds.has(item.morador.id);
            const isUsuarioLogado = item.morador.id === user?.id;

            return (
              <div
                key={item.morador.id}
                className="rounded-2xl border border-line bg-surface overflow-hidden transition-all shadow-2xs"
              >
                {/* Linha Cabeçalho do Morador */}
                <button
                  type="button"
                  onClick={() => toggleExpansaoMorador(item.morador.id)}
                  className="w-full p-4 flex items-start justify-between gap-3 text-left hover:bg-cream/20 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-base font-semibold text-ink">
                        {item.apelidoExibicao}
                      </span>
                      {isUsuarioLogado && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-mint text-forest">
                          Você
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        · Geração {item.morador.geracao || '025'}
                        {item.morador.quarto?.nome ? ` · ${item.morador.quarto.nome}` : ''}
                      </span>
                    </div>

                    {/* Resumo rápido dos motivos pendentes */}
                    {item.pendentesCount > 0 ? (
                      <p className="text-xs text-clay font-medium mt-1 line-clamp-2 leading-relaxed">
                        ⚠️ {item.resumoMotivosPendentes}
                      </p>
                    ) : (
                      <p className="text-xs text-muted mt-1">
                        Em dia · Nenhuma caixa pendente
                      </p>
                    )}
                  </div>

                  {/* Lado Direito: Tags e Chevron */}
                  <div className="shrink-0 flex items-center gap-2 pt-0.5">
                    {item.baixaSolicitadaCount > 0 && (
                      <Tag tone="neutral">
                        {item.baixaSolicitadaCount} em análise
                      </Tag>
                    )}
                    {item.pendentesCount > 0 ? (
                      <Tag tone="alert">
                        {item.pendentesCount} {item.pendentesCount === 1 ? 'caixa' : 'caixas'}
                      </Tag>
                    ) : (
                      <Tag tone="green">0 caixas</Tag>
                    )}
                    <div className="text-muted">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Corpo Expandido (Accordion) */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-line/60 bg-paper/40 space-y-4">
                    {/* Lista de Caixas em Aberto */}
                    <div className="pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                        <Beer className="w-3.5 h-3.5 text-forest" />
                        Caixas Pendentes ({item.caixasEmAberto.length})
                      </p>

                      {item.caixasEmAberto.length === 0 ? (
                        <p className="text-xs text-muted italic p-3 rounded-xl border border-line bg-surface">
                          Nenhuma caixa pendente para {item.apelidoExibicao}.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {item.caixasEmAberto.map((caixa) => (
                            <div
                              key={caixa.id}
                              className="p-3.5 rounded-xl border border-line bg-surface space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-paper border border-line text-muted uppercase">
                                      {caixa.origem === 'pontos' ? '7 Pontos' : 'Tradição'}
                                    </span>
                                    <span className="text-[11px] text-muted">
                                      Atribuída em {caixa.data_atribuicao}
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-semibold text-ink leading-snug">
                                    {caixa.motivo_descricao}
                                  </h4>
                                </div>

                                <Tag tone={caixa.status === 'baixa_solicitada' ? 'neutral' : 'alert'}>
                                  {caixa.status === 'baixa_solicitada' ? 'Baixa solicitada' : 'Pendente'}
                                </Tag>
                              </div>

                              {/* Ações contextuais */}
                              <div className="pt-2 border-t border-line/70 flex items-center justify-between gap-2 flex-wrap">
                                {/* Visão do Morador devedor */}
                                {isUsuarioLogado && (
                                  <div>
                                    {caixa.status === 'pendente' && (
                                      <button
                                        type="button"
                                        onClick={() => handleSolicitarBaixa(caixa.id)}
                                        className="py-1.5 px-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        Solicitar Baixa (Já entreguei)
                                      </button>
                                    )}
                                    {caixa.status === 'baixa_solicitada' && (
                                      <span className="text-xs text-muted flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-forest" />
                                        Solicitação enviada · Aguardando confirmação do Admin
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Visão do Administrador */}
                                {isAdmin && (
                                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                                    {caixa.status === 'baixa_solicitada' ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleAprovarBaixa(caixa.id)}
                                          className="py-1.5 px-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold transition-colors flex items-center gap-1"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                          Confirmar Baixa
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRecusarSolicitacao(caixa.id)}
                                          className="py-1.5 px-2.5 rounded-lg border border-line bg-paper hover:text-clay text-muted text-xs font-medium transition-colors"
                                        >
                                          Recusar
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleAprovarBaixa(caixa.id)}
                                        className="py-1.5 px-3 rounded-lg border border-line bg-paper hover:bg-mint text-ink text-xs font-semibold transition-colors"
                                      >
                                        Dar Baixa Direta
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      title="Excluir lançamento"
                                      onClick={() => handleExcluirCaixa(caixa.id)}
                                      className="p-1.5 text-muted hover:text-clay rounded-md transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Histórico Individual de Caixas Pagas por este Morador */}
                    {item.pagasCount > 0 && (
                      <div className="pt-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                          Já Pagas por {item.apelidoExibicao} ({item.pagasCount})
                        </p>
                        <div className="space-y-1.5">
                          {item.caixasPagas.map((c) => (
                            <div
                              key={c.id}
                              className="p-2.5 rounded-lg border border-line bg-surface text-xs flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-ink truncate">{c.motivo_descricao}</p>
                                <p className="text-[11px] text-muted mt-0.5">
                                  {c.origem === 'pontos' ? '7 Pontos' : 'Tradição'} · Baixada em {c.baixada_em ? new Date(c.baixada_em).toLocaleDateString('pt-BR') : c.data_atribuicao}
                                </p>
                              </div>
                              <Tag tone="green">Paga</Tag>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ação rápida para o Admin lançar para este morador */}
                    {isAdmin && (
                      <div className="pt-1">
                        <Button
                          full
                          variant="outline"
                          onClick={() => abrirModalLancamento(item.morador.id)}
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            <PlusCircle className="w-4 h-4 text-forest" />
                            Lançar 1 caixa para {item.apelidoExibicao}
                          </span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : activeTab === 'solicitacoes' && isAdmin ? (
        /* ABA 2: LISTA DE CAIXAS COM SOLICITAÇÃO DE BAIXA (ADMIN) */
        <div className="space-y-3">
          {caixasSolicitadas.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted border border-dashed border-line rounded-2xl bg-surface/50">
              <Beer className="w-8 h-8 text-forest/40 mx-auto mb-2" />
              <p className="font-semibold text-ink text-sm">Nenhuma solicitação pendente</p>
              <p className="mt-1">Todas as baixas solicitadas já foram avaliadas pelo Admin.</p>
            </div>
          ) : (
            caixasSolicitadas.map((caixa) => {
              const apelidoMorador = obterApelidoMorador(caixa.morador);
              const dataSolicitadaStr = caixa.solicitada_em
                ? new Date(caixa.solicitada_em).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : null;

              return (
                <div
                  key={caixa.id}
                  className="p-4 rounded-2xl border border-line bg-surface space-y-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-base font-semibold text-ink">
                          {apelidoMorador}
                        </span>
                        <span className="text-xs text-muted">
                          · Geração {caixa.morador?.geracao || '025'}
                          {caixa.morador?.quarto?.nome ? ` · ${caixa.morador.quarto.nome}` : ''}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-ink mt-1.5 leading-snug">
                        {caixa.motivo_descricao}
                      </h4>
                    </div>

                    <Tag tone="neutral">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-clay" />
                        Baixa solicitada
                      </span>
                    </Tag>
                  </div>

                  <div className="text-[11px] text-muted flex items-center gap-2 flex-wrap">
                    <span className="font-semibold px-2 py-0.5 rounded-md bg-paper border border-line uppercase">
                      {caixa.origem === 'pontos' ? '7 Pontos' : 'Tradição'}
                    </span>
                    <span>Atribuída em {caixa.data_atribuicao}</span>
                    {dataSolicitadaStr && (
                      <span>· Solicitada em {dataSolicitadaStr}</span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-line flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      title="Excluir lançamento"
                      onClick={() => handleExcluirCaixa(caixa.id)}
                      className="p-2 text-muted hover:text-clay rounded-lg hover:bg-cream/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleRecusarSolicitacao(caixa.id)}
                        className="py-2 px-3 rounded-xl border border-line bg-paper hover:bg-clay-tint hover:border-clay/40 text-clay text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAprovarBaixa(caixa.id)}
                        className="py-2 px-4 rounded-xl bg-forest hover:bg-forest-dark text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <Check className="w-4 h-4" />
                        Aceitar Baixa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ABA 3: HISTÓRICO GERAL DE CAIXAS PAGAS */
        <div className="space-y-3">
          {historicoPagas.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted">
              Nenhuma caixa com baixa registrada no histórico.
            </div>
          ) : (
            historicoPagas.map((caixa) => {
              const apelidoMorador = obterApelidoMorador(caixa.morador);
              const apelidoAdmin = obterApelidoMorador(caixa.admin_baixa);
              const dataBaixaStr = caixa.baixada_em
                ? new Date(caixa.baixada_em).toLocaleDateString('pt-BR')
                : caixa.data_atribuicao;

              return (
                <div
                  key={caixa.id}
                  className="p-4 rounded-xl border border-line bg-surface space-y-2 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-ink">
                        {apelidoMorador}
                      </h4>
                      <p className="text-xs text-muted mt-0.5">
                        {caixa.motivo_descricao}
                      </p>
                    </div>
                    <Tag tone="green">Paga</Tag>
                  </div>

                  <div className="pt-2 border-t border-line flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>
                      {caixa.origem === 'pontos' ? 'Acúmulo de 7 pontos' : 'Tradição da casa'}
                    </span>
                    <span>
                      Confirmada em {dataBaixaStr} por {apelidoAdmin}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL DE LANÇAMENTO MANUAL UNITÁRIO (ADMIN) */}
      {modalLancamentoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Lançar Caixa de Cerveja
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Registro estritamente unitário (1 caixa)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalLancamentoOpen(false)}
                className="text-muted hover:text-ink p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {erroLancamento && (
              <div className="p-3 rounded-xl bg-clay-tint border border-clay/30 text-clay text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroLancamento}</span>
              </div>
            )}

            <form onSubmit={handleSubmitLancamento} className="space-y-4">
              {/* Seleção do Morador */}
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                  Morador Devedor <span className="text-clay font-bold">*</span>
                </label>
                <select
                  value={moradorSelecionadoId}
                  onChange={(e) => setMoradorSelecionadoId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                >
                  {moradoresAtivos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {obterApelidoMorador(m)} — Geração {m.geracao || '025'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sugestões Rápidas de Tradições */}
              <div>
                <span className="block text-[11px] font-medium text-muted mb-1.5">
                  Sugestões de Tradição:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_TRADICAO_SUGESTOES.map((motivo) => (
                    <button
                      key={motivo}
                      type="button"
                      onClick={() => setMotivoDescricao(motivo)}
                      className="px-2.5 py-1 rounded-lg border border-line bg-surface hover:border-forest text-xs text-ink transition-colors"
                    >
                      {motivo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Motivo Descrição */}
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                  Motivo do Lançamento <span className="text-clay font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={motivoDescricao}
                  onChange={(e) => setMotivoDescricao(e.target.value)}
                  placeholder="Ex: Passou no estágio da Embraer"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
                />
              </div>

              {/* Data de Atribuição */}
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                  Data de Atribuição
                </label>
                <input
                  type="date"
                  required
                  value={dataAtribuicao}
                  onChange={(e) => setDataAtribuicao(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                />
              </div>

              <div className="p-3 rounded-xl bg-cream/50 border border-line text-[11px] text-muted leading-relaxed">
                <span className="font-semibold text-ink">Nota:</span> Esta ação adiciona 1 caixa com status <strong>Pendente</strong> para o morador selecionado.
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  full
                  onClick={() => setModalLancamentoOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  full
                  disabled={salvandoLancamento || !motivoDescricao.trim()}
                >
                  {salvandoLancamento ? 'Salvando...' : 'Lançar 1 Caixa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
