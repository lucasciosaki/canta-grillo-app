import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile } from '../../types/auth';
import {
  type MarcaMistura,
  type DailyMeal,
  marcaToNumeric,
  numericToMarca,
  getLocalDateString,
  formatarDataExtenso,
  calcularResumoMisturas,
  isWeekendDateString,
  getAdjacentWeekday,
} from '../../types/refeicoes';
import { PageTitle, Tag } from '../../components/ui';
import {
  ChevronLeft,
  ChevronRight,
  Utensils,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Users,
  Copy,
  Check,
  Share2,
  UserPlus,
} from 'lucide-react';

interface MisturasScreenProps {
  onBack: () => void;
}

export const MisturasScreen: React.FC<MisturasScreenProps> = ({ onBack }) => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  // Data selecionada (formato YYYY-MM-DD)
  const hoje = useMemo(() => getLocalDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(hoje);

  // Lista de moradores ativos da república
  const [moradores, setMoradores] = useState<Profile[]>([]);
  // Lista de convidados externos ativos
  const [convidados, setConvidados] = useState<Profile[]>([]);
  // Mapa de marcações: userId -> misturas_consumidas (0.0, 0.5, 1.0)
  const [mealsMap, setMealsMap] = useState<Record<string, number>>({});
  
  const [loading, setLoading] = useState(true);
  const [salvandoMeu, setSalvandoMeu] = useState(false);
  const [adminSavingId, setAdminSavingId] = useState<string | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // 1. Carrega todos os perfis ativos (moradores e convidados separados)
  useEffect(() => {
    let cancel = false;
    const carregarPerfis = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, quarto:rooms(*)')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (!cancel && !error && data) {
        const perfis = data as Profile[];

        // Separa moradores internos (role 'morador' ou 'admin')
        const listaMoradores = perfis
          .filter((p) => p.role !== 'externo')
          .sort((a, b) => {
            const apelidoA = a.apelido || a.nome;
            const apelidoB = b.apelido || b.nome;
            return apelidoA.localeCompare(apelidoB, 'pt-BR');
          });

        // Separa convidados externos (role 'externo')
        const listaConvidados = perfis
          .filter((p) => p.role === 'externo')
          .sort((a, b) => {
            const apelidoA = a.apelido || a.nome;
            const apelidoB = b.apelido || b.nome;
            return apelidoA.localeCompare(apelidoB, 'pt-BR');
          });

        setMoradores(listaMoradores);
        setConvidados(listaConvidados);
      }
    };

    carregarPerfis();
    return () => {
      cancel = true;
    };
  }, []);

  // 2. Carrega as refeições da data selecionada
  const carregarRefeicoesDaData = useCallback(async (dataStr: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('daily_meals')
      .select('id, usuario_id, data, misturas_consumidas')
      .eq('data', dataStr);

    if (!error && data) {
      const mapa: Record<string, number> = {};
      data.forEach((meal: DailyMeal) => {
        mapa[meal.usuario_id] = Number(meal.misturas_consumidas);
      });
      setMealsMap(mapa);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregarRefeicoesDaData(selectedDate);
  }, [selectedDate, carregarRefeicoesDaData]);

  // 3. Supabase Realtime para sincronização instantânea na casa
  useEffect(() => {
    const channel = supabase
      .channel(`daily-meals-${selectedDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_meals',
          filter: `data=eq.${selectedDate}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRow = payload.new as DailyMeal;
            setMealsMap((prev) => ({
              ...prev,
              [newRow.usuario_id]: Number(newRow.misturas_consumidas),
            }));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { usuario_id?: string };
            if (oldRow.usuario_id) {
              setMealsMap((prev) => {
                const copia = { ...prev };
                delete copia[oldRow.usuario_id!];
                return copia;
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  const isHoje = selectedDate === hoje;
  const isFimDeSemana = isWeekendDateString(selectedDate);
  const podeEditarHoje = isHoje && !isFimDeSemana;

  // Próxima data útil para controle do botão de avançar dia
  const proximaDataUtil = useMemo(
    () => getAdjacentWeekday(selectedDate, 1, hoje),
    [selectedDate, hoje]
  );
  const canGoForward = !isHoje && proximaDataUtil !== selectedDate && proximaDataUtil <= hoje;

  // Navegação de dias (pula automaticamente sábados e domingos; dias > hoje são estritamente bloqueados)
  const mudarDia = (direcao: -1 | 1) => {
    const novaData = getAdjacentWeekday(selectedDate, direcao, hoje);
    // Bloqueia qualquer navegação para o futuro ou sem alteração
    if (novaData > hoje || novaData === selectedDate) return;
    setSelectedDate(novaData);
  };

  // Marcação do próprio usuário logado (apenas no dia útil vigente)
  const handleMarcarMinhaMistura = async (marca: MarcaMistura) => {
    if (!user) return;
    if (!isHoje) {
      alert('Não é possível alterar marcações de dias anteriores (somente leitura).');
      return;
    }
    if (isFimDeSemana) {
      alert('A Folha de Misturas não opera nos finais de semana (segunda a sexta).');
      return;
    }
    const novoValor = marcaToNumeric(marca);
    const valorAnterior = mealsMap[user.id] ?? 0.0;

    // Atualização otimista
    setMealsMap((prev) => ({ ...prev, [user.id]: novoValor }));
    setSalvandoMeu(true);
    setFeedbackMsg(null);

    const { error } = await supabase.from('daily_meals').upsert(
      {
        usuario_id: user.id,
        data: selectedDate,
        misturas_consumidas: novoValor,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'usuario_id,data' }
    );

    setSalvandoMeu(false);
    if (error) {
      // Reverte em caso de erro
      setMealsMap((prev) => ({ ...prev, [user.id]: valorAnterior }));
      setFeedbackMsg({ tipo: 'err', texto: 'Erro ao salvar marcação: ' + error.message });
    } else {
      setFeedbackMsg({ tipo: 'ok', texto: 'Marcação salva!' });
      setTimeout(() => setFeedbackMsg(null), 2500);
    }
  };

  // Marcação realizada pelo Admin para outro morador (apenas no dia útil vigente)
  const handleAdminAlterarMarca = async (targetUserId: string, marca: MarcaMistura) => {
    if (!isAdmin) return;
    if (!isHoje) {
      alert('Não é possível alterar marcações de dias anteriores (somente leitura).');
      return;
    }
    if (isFimDeSemana) {
      alert('A Folha de Misturas não opera nos finais de semana (segunda a sexta).');
      return;
    }
    const novoValor = marcaToNumeric(marca);
    const valorAnterior = mealsMap[targetUserId] ?? 0.0;

    // Atualização otimista
    setMealsMap((prev) => ({ ...prev, [targetUserId]: novoValor }));
    setAdminSavingId(targetUserId);

    const { error } = await supabase.from('daily_meals').upsert(
      {
        usuario_id: targetUserId,
        data: selectedDate,
        misturas_consumidas: novoValor,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'usuario_id,data' }
    );

    setAdminSavingId(null);
    if (error) {
      setMealsMap((prev) => ({ ...prev, [targetUserId]: valorAnterior }));
      alert('Erro ao atualizar morador: ' + error.message);
    }
  };

  // Alterna presença de convidado externo pelo Administrador (apenas no dia útil vigente)
  const handleAdminToggleConvidado = async (convidadoId: string) => {
    if (!isAdmin) return;
    if (!isHoje) {
      alert('Não é possível alterar marcações de dias anteriores (somente leitura).');
      return;
    }
    if (isFimDeSemana) {
      alert('A Folha de Misturas não opera nos finais de semana (segunda a sexta).');
      return;
    }
    const atual = mealsMap[convidadoId] ?? 0.0;
    const novoValor = atual >= 0.5 ? 0.0 : 1.0;
    const valorAnterior = atual;

    setMealsMap((prev) => ({ ...prev, [convidadoId]: novoValor }));
    setAdminSavingId(convidadoId);

    const { error } = await supabase.from('daily_meals').upsert(
      {
        usuario_id: convidadoId,
        data: selectedDate,
        misturas_consumidas: novoValor,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'usuario_id,data' }
    );

    setAdminSavingId(null);
    if (error) {
      setMealsMap((prev) => ({ ...prev, [convidadoId]: valorAnterior }));
      alert('Erro ao atualizar convidado: ' + error.message);
    }
  };

  // Link de convite oficial para convidados externos
  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/?convite=externo`
    : 'https://cantagrillo.app/?convite=externo';

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      alert('Link de convite: ' + inviteLink);
    }
  };

  const handleCompartilharWhatsApp = () => {
    const msg = encodeURIComponent(
      `Salve! Segue o link para registrar sua refeição na República Canta Grillo:\n${inviteLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  // Convidados que comeram no dia selecionado
  const convidadosComendoHoje = useMemo(() => {
    return convidados.filter((c) => (mealsMap[c.id] ?? 0.0) >= 0.5);
  }, [convidados, mealsMap]);

  // Resumo estatístico para a cozinha (incluindo convidados externos)
  const resumo = useMemo(
    () => calcularResumoMisturas(moradores, mealsMap, convidadosComendoHoje.length),
    [moradores, mealsMap, convidadosComendoHoje.length]
  );

  // Minha marcação atual
  const minhaMarcaAtual = numericToMarca(user ? mealsMap[user.id] : undefined);

  // Filtragem de moradores para pesquisa
  const moradoresFiltrados = useMemo(() => {
    if (!filtroTexto.trim()) return moradores;
    const q = filtroTexto.toLowerCase();
    return moradores.filter((m) => {
      const apelidoMatch = (m.apelido || m.nome).toLowerCase().includes(q);
      const quartoMatch = m.quarto?.nome.toLowerCase().includes(q) || false;
      return apelidoMatch || quartoMatch;
    });
  }, [moradores, filtroTexto]);

  return (
    <div className="pb-12">
      <PageTitle
        title="Misturas"
        hint="Controle diário de almoço e janta da república"
        back={{ label: 'Rotina', onClick: onBack }}
      />

      {/* 1. SELETOR DE DATA E NAVEGAÇÃO */}
      <div className="mb-6 p-3 rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => mudarDia(-1)}
            aria-label="Dia anterior"
            className="p-2 rounded-lg hover:bg-line/40 text-muted hover:text-ink transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center min-w-0">
            <h3 className="text-sm font-semibold text-ink truncate">
              {formatarDataExtenso(selectedDate)}
            </h3>
            <p className="text-[11px] text-muted">{selectedDate}</p>
          </div>

          <button
            onClick={() => mudarDia(1)}
            disabled={!canGoForward}
            aria-label="Próximo dia"
            title={!canGoForward ? 'Não é possível navegar para dias futuros' : 'Próximo dia útil'}
            className="p-2 rounded-lg hover:bg-line/40 text-muted hover:text-ink disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {selectedDate !== hoje && (
          <div className="mt-2 pt-2 border-t border-line/60 flex justify-center">
            <button
              onClick={() => setSelectedDate(hoje)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-forest hover:text-forest-dark"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Voltar para o dia de hoje
            </button>
          </div>
        )}
      </div>

      {/* 2. CARD DE DESTAQUE: MINHA COTA DE HOJE */}
      <div className="mb-6 p-4 rounded-xl border-2 border-forest/30 bg-surface shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-forest text-white flex items-center justify-center font-bold text-xs">
              <Utensils className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink">Sua cota de misturas</h4>
              <p className="text-[11px] text-muted">
                {isFimDeSemana
                  ? 'Folha fechada no fim de semana'
                  : isHoje
                  ? 'Você tem direito a 2 misturas por dia'
                  : `Visualizando registro de ${selectedDate}`}
              </p>
            </div>
          </div>
          <Tag tone={isFimDeSemana ? 'neutral' : !isHoje ? 'neutral' : minhaMarcaAtual === '—' ? 'neutral' : 'green'}>
            {isFimDeSemana
              ? 'Fim de semana (Fechada)'
              : !isHoje
              ? 'Histórico (Somente leitura)'
              : minhaMarcaAtual === '—'
              ? 'Não marcado'
              : `${minhaMarcaAtual} cota`}
          </Tag>
        </div>

        {/* Banner informativo de fim de semana */}
        {isFimDeSemana && (
          <div className="mb-3.5 p-3 rounded-xl bg-cream/70 border border-line flex items-center gap-2.5 text-xs text-ink/80">
            <AlertCircle className="w-4 h-4 text-forest shrink-0" />
            <span>Folha fechada no fim de semana — A marcação de almoço e janta funciona apenas de segunda a sexta-feira.</span>
          </div>
        )}

        {/* 3 Botões rápidos de marcação */}
        <div className="grid grid-cols-3 gap-2">
          {(['—', '1/2', 'X'] as MarcaMistura[]).map((m) => {
            const isSelected = minhaMarcaAtual === m;
            const labels: Record<MarcaMistura, string> = {
              '—': 'Não vou comer (0)',
              '1/2': '1 mistura (Almoço)',
              'X': '2 misturas (Completo)',
            };
            return (
              <button
                key={m}
                onClick={() => handleMarcarMinhaMistura(m)}
                disabled={!podeEditarHoje || salvandoMeu}
                className={`py-3.5 px-2 rounded-xl text-center transition-all ${
                  isSelected
                    ? 'bg-forest text-white font-bold ring-2 ring-forest/30 shadow-sm'
                    : 'bg-cream/60 hover:bg-cream border border-line text-ink font-semibold'
                } ${!podeEditarHoje ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="block text-xl leading-none mb-1">{m}</span>
                <span
                  className={`block text-[10px] leading-tight truncate ${
                    isSelected ? 'text-white/90' : 'text-muted'
                  }`}
                >
                  {labels[m]}
                </span>
              </button>
            );
          })}
        </div>

        {isFimDeSemana ? (
          <p className="mt-2.5 text-[11px] text-muted text-center">
            A Folha de Misturas funciona exclusivamente de segunda a sexta-feira.
          </p>
        ) : !isHoje ? (
          <p className="mt-2.5 text-[11px] text-muted text-center">
            Modo histórico: dias anteriores estão disponíveis apenas para consulta.
          </p>
        ) : null}

        {feedbackMsg && (
          <div
            className={`mt-2.5 flex items-center gap-1.5 text-xs font-medium ${
              feedbackMsg.tipo === 'ok' ? 'text-forest' : 'text-clay'
            }`}
          >
            {feedbackMsg.tipo === 'ok' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{feedbackMsg.texto}</span>
          </div>
        )}
      </div>

      {/* 3. RESUMO CONSOLIDADO PARA A COZINHA */}
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <div className="p-3.5 rounded-xl border border-line bg-surface">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">
            Total de Misturas
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-forest tabular">
              {resumo.totalMisturas.toFixed(1).replace('.0', '')}
            </span>
            <span className="text-xs text-muted">unidades</span>
          </div>
          <p className="text-[11px] text-muted mt-1">
            Consumo da casa no dia
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-line bg-surface">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">
            Comendo Hoje
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-ink tabular">
              {resumo.totalPessoas}
            </span>
            <span className="text-xs text-muted">
              {convidadosComendoHoje.length > 0
                ? `(${resumo.totalCheia + resumo.totalMeia} mor. + ${convidadosComendoHoje.length} conv.)`
                : `de ${moradores.length}`}
            </span>
          </div>
          <p className="text-[11px] text-muted mt-1">
            {resumo.totalCheia} com 2 e {resumo.totalMeia} com 1
          </p>
        </div>
      </div>

      {/* 4. FOLHA DE MISTURAS DIGITAL (LISTAGEM DE MORADORES) */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Folha Digital da Casa ({moradores.length} moradores)
        </h3>
        {isAdmin && isHoje && (
          <span className="text-[10px] bg-mint text-forest font-semibold px-2 py-0.5 rounded-full">
            Admin: Edição liberada
          </span>
        )}
        {!isHoje && (
          <span className="text-[10px] bg-line text-muted font-semibold px-2 py-0.5 rounded-full">
            Histórico (Somente leitura)
          </span>
        )}
      </div>

      {/* Campo de busca */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Buscar morador ou quarto..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-line bg-surface placeholder:text-muted/60 text-ink focus:outline-none focus:border-forest"
        />
      </div>

      {loading ? (
        <p className="text-xs text-muted py-8 text-center">Carregando folha de misturas...</p>
      ) : moradoresFiltrados.length === 0 ? (
        <div className="py-8 text-center text-muted">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Nenhum morador encontrado com esse filtro.</p>
        </div>
      ) : (
        <div className="divide-y divide-line border-y border-line bg-surface rounded-xl overflow-hidden shadow-2xs">
          {moradoresFiltrados.map((m) => {
            const isMe = user?.id === m.id;
            const valor = mealsMap[m.id];
            const marca = numericToMarca(valor);

            return (
              <div
                key={m.id}
                className={`p-3 flex items-center justify-between gap-3 ${
                  isMe ? 'bg-mint/30' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-ink truncate">
                      {m.apelido || m.nome}
                    </p>
                    {isMe && (
                      <span className="text-[10px] font-bold bg-forest text-white px-1.5 py-0.2 rounded">
                        Você
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {m.quarto?.nome || 'Sem quarto'} · {m.geracao || '025'}
                  </p>
                </div>

                {/* Controles de marcação */}
                <div className="flex items-center gap-1">
                  {!podeEditarHoje ? (
                    // Em dias anteriores ou fins de semana: somente leitura para todos (inclusive Admin)
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm bg-cream/50 border border-line text-forest">
                      {marca}
                    </div>
                  ) : isAdmin ? (
                    // Administrador tem os 3 botões interativos para ajustar o morador no dia de hoje
                    <div className="flex items-center gap-1 bg-cream/70 p-1 rounded-lg border border-line">
                      {(['—', '1/2', 'X'] as MarcaMistura[]).map((btnMarca) => {
                        const isCurrent = marca === btnMarca;
                        return (
                          <button
                            key={btnMarca}
                            onClick={() => handleAdminAlterarMarca(m.id, btnMarca)}
                            disabled={adminSavingId === m.id}
                            className={`w-8 h-8 rounded-md text-xs font-semibold transition-all ${
                              isCurrent
                                ? 'bg-forest text-white shadow-xs'
                                : 'text-ink hover:bg-surface'
                            }`}
                          >
                            {btnMarca}
                          </button>
                        );
                      })}
                    </div>
                  ) : isMe ? (
                    // Morador comum: visualiza o status e pode alterar apenas o seu próprio no dia de hoje
                    <div className="flex items-center gap-1 bg-cream/70 p-1 rounded-lg border border-line">
                      {(['—', '1/2', 'X'] as MarcaMistura[]).map((btnMarca) => {
                        const isCurrent = marca === btnMarca;
                        return (
                          <button
                            key={btnMarca}
                            onClick={() => handleMarcarMinhaMistura(btnMarca)}
                            disabled={salvandoMeu}
                            className={`w-8 h-8 rounded-md text-xs font-semibold transition-all ${
                              isCurrent
                                ? 'bg-forest text-white shadow-xs'
                                : 'text-ink hover:bg-surface'
                            }`}
                          >
                            {btnMarca}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm bg-cream/50 border border-line text-forest">
                      {marca}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. SEÇÃO DE CONVIDADOS / MEMBROS EXTERNOS */}
      <div className="mt-8 pt-6 border-t border-line">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Convidados & Agregados ({convidadosComendoHoje.length} comeram hoje)
              </h3>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Refeições de visitantes para acerto com a Caixinha
            </p>
          </div>

          {/* Botões de Ação do Convite */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopiarLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface hover:bg-cream/50 text-xs font-medium text-ink transition-colors shadow-2xs"
              title="Copiar link para enviar ao convidado"
            >
              {copiado ? (
                <>
                  <Check className="w-3.5 h-3.5 text-forest" />
                  <span className="text-forest font-semibold">Link copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-muted" />
                  <span>Copiar link</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCompartilharWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mint border border-forest/30 text-forest hover:bg-mint/80 text-xs font-semibold transition-colors"
              title="Compartilhar link de convite no WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Card explicativo com link direto visível */}
        <div className="mb-4 p-3 rounded-xl bg-cream/40 border border-line flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <span className="font-semibold text-ink block">Link para cadastro de convidados:</span>
            <span className="text-muted text-[11px] truncate block font-mono">
              {inviteLink}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopiarLink}
            className="shrink-0 p-2 rounded-lg bg-surface border border-line text-muted hover:text-ink transition-colors"
            aria-label="Copiar link de convite"
          >
            {copiado ? <Check className="w-4 h-4 text-forest" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Lista de convidados */}
        {convidados.length === 0 ? (
          <div className="p-6 rounded-xl border border-line bg-surface text-center">
            <UserPlus className="w-8 h-8 text-muted mx-auto mb-2 opacity-40" />
            <p className="text-xs font-medium text-ink">Nenhum convidado cadastrado ainda</p>
            <p className="text-[11px] text-muted mt-1 max-w-xs mx-auto">
              Copie o link acima e mande para seus amigos. Eles se cadastram em 10 segundos e registram que comeram na casa!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line border border-line bg-surface rounded-xl overflow-hidden shadow-2xs">
            {convidados.map((c) => {
              const comeu = (mealsMap[c.id] ?? 0.0) >= 0.5;
              const apelido = c.apelido || c.nome;

              return (
                <div
                  key={c.id}
                  className={`p-3 flex items-center justify-between gap-3 ${
                    comeu ? 'bg-mint/20' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-ink truncate">
                        {apelido}
                      </p>
                      <span className="text-[10px] bg-cream text-muted font-medium px-1.5 py-0.2 rounded border border-line/60">
                        Convidado
                      </span>
                    </div>
                    {c.telefone_contato && (
                      <p className="text-[11px] text-muted mt-0.5">
                        WhatsApp: {c.telefone_contato}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Tag tone={comeu ? 'green' : 'neutral'}>
                      {comeu ? '🍽️ Comeu hoje' : isFimDeSemana ? 'Folha fechada' : 'Não marcou'}
                    </Tag>

                    {isAdmin && podeEditarHoje && (
                      <button
                        type="button"
                        onClick={() => handleAdminToggleConvidado(c.id)}
                        disabled={adminSavingId === c.id}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                          comeu
                            ? 'border-line text-muted hover:text-clay hover:border-clay/40'
                            : 'bg-forest text-white border-forest hover:bg-forest-dark'
                        }`}
                      >
                        {adminSavingId === c.id
                          ? 'Salvando...'
                          : comeu
                          ? 'Desmarcar'
                          : 'Marcar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
