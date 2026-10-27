import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { getLocalDateString, formatarDataExtenso, isWeekendDateString } from '../../types/refeicoes';
import { Button } from '../../components/ui';
import {
  Utensils,
  CheckCircle2,
  Calendar,
  LogOut,
  Sparkles,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';

export const ConvidadoScreen: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const hoje = useMemo(() => getLocalDateString(new Date()), []);
  const isFimDeSemanaHoje = useMemo(() => isWeekendDateString(hoje), [hoje]);

  const [comeuHoje, setComeuHoje] = useState(false);
  const [loadingHoje, setLoadingHoje] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Histórico de refeições do mês corrente
  const [totalMes, setTotalMes] = useState<number>(0);
  const [diasMes, setDiasMes] = useState<string[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);

  // Nome de exibição respeitando estritamente a regra de apelido
  const apelidoExibicao =
    profile?.apelido ||
    user?.user_metadata?.apelido ||
    profile?.nome?.split(' ')[0] ||
    user?.user_metadata?.nome?.split(' ')[0] ||
    'Convidado';

  // 1. Carrega se o convidado já marcou refeição hoje
  const carregarStatusHoje = useCallback(async () => {
    if (!user) return;
    if (isFimDeSemanaHoje) {
      setComeuHoje(false);
      setLoadingHoje(false);
      return;
    }
    setLoadingHoje(true);

    const { data, error } = await supabase
      .from('daily_meals')
      .select('misturas_consumidas')
      .eq('usuario_id', user.id)
      .eq('data', hoje)
      .maybeSingle();

    if (!error && data) {
      setComeuHoje(Number(data.misturas_consumidas) > 0);
    } else {
      setComeuHoje(false);
    }
    setLoadingHoje(false);
  }, [user, hoje, isFimDeSemanaHoje]);

  // 2. Carrega total de refeições do mês
  const carregarHistoricoMes = useCallback(async () => {
    if (!user) return;
    setLoadingHistorico(true);

    const dataObj = new Date();
    const ano = dataObj.getFullYear();
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const inicioMes = `${ano}-${mes}-01`;
    const fimMes = `${ano}-${mes}-31`;

    const { data, error } = await supabase
      .from('daily_meals')
      .select('data, misturas_consumidas')
      .eq('usuario_id', user.id)
      .gte('data', inicioMes)
      .lte('data', fimMes)
      .gt('misturas_consumidas', 0)
      .order('data', { ascending: false });

    if (!error && data) {
      setTotalMes(data.length);
      setDiasMes(data.map((d) => d.data));
    }
    setLoadingHistorico(false);
  }, [user]);

  useEffect(() => {
    carregarStatusHoje();
    carregarHistoricoMes();
  }, [carregarStatusHoje, carregarHistoricoMes]);

  // 3. Realtime para caso outro dispositivo atualize
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`convidado-meal-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_meals',
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as { data: string; misturas_consumidas: number };
            if (row.data === hoje) {
              setComeuHoje(Number(row.misturas_consumidas) > 0);
            }
            carregarHistoricoMes();
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { data?: string };
            if (oldRow.data === hoje) {
              setComeuHoje(false);
            }
            carregarHistoricoMes();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, hoje, carregarHistoricoMes]);

  // 4. Marcação de refeição de hoje (1.0 = comeu na casa)
  const handleToggleRefeicao = async (marcar: boolean) => {
    if (!user) return;
    if (isFimDeSemanaHoje) {
      setMensagemFeedback({
        tipo: 'err',
        texto: 'A Folha de Misturas funciona exclusivamente de segunda a sexta-feira.',
      });
      return;
    }
    setSalvando(true);
    setMensagemFeedback(null);

    const valor = marcar ? 1.0 : 0.0;

    // Atualização otimista
    setComeuHoje(marcar);

    const { error } = await supabase.from('daily_meals').upsert(
      {
        usuario_id: user.id,
        data: hoje,
        misturas_consumidas: valor,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'usuario_id,data' }
    );

    setSalvando(false);

    if (error) {
      setComeuHoje(!marcar); // Reverte
      setMensagemFeedback({ tipo: 'err', texto: 'Erro ao registrar: ' + error.message });
    } else {
      setMensagemFeedback({
        tipo: 'ok',
        texto: marcar
          ? 'Refeição registrada com sucesso! Bom apetite!'
          : 'Registro de hoje desmarcado.',
      });
      carregarHistoricoMes();
      setTimeout(() => setMensagemFeedback(null), 3000);
    }
  };

  const mesAtualNome = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
  const mesCapitalizado = mesAtualNome.charAt(0).toUpperCase() + mesAtualNome.slice(1);

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col justify-between">
      {/* Topo / Header minimalista */}
      <header className="px-5 py-4 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-line bg-surface shrink-0">
            <img src="/logo.png" alt="Logo Canta Grillo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink leading-tight">Canta Grillo</h1>
            <span className="text-[11px] font-semibold text-forest bg-mint px-2 py-0.5 rounded-full inline-block">
              Área do Convidado
            </span>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-muted hover:text-clay hover:border-clay/40 transition-colors"
          title="Sair da conta"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair</span>
        </button>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-md w-full mx-auto px-5 py-6 space-y-5">
        {/* Saudação */}
        <div className="text-center pt-2 pb-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream/70 border border-line text-xs text-muted mb-2">
            <Sparkles className="w-3.5 h-3.5 text-forest" />
            <span>Bem-vindo à Canta Grillo</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">
            E aí, {apelidoExibicao}! 🦗
          </h2>
          <p className="text-xs text-muted mt-1">
            {formatarDataExtenso(hoje)}
          </p>
        </div>

        {/* Feedback visual de ações */}
        {mensagemFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              mensagemFeedback.tipo === 'ok'
                ? 'bg-mint border-forest/30 text-forest'
                : 'bg-clay-tint border-clay/30 text-clay'
            }`}
          >
            {mensagemFeedback.tipo === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{mensagemFeedback.texto}</span>
          </div>
        )}

        {/* CARD PRINCIPAL: REGISTRO DE REFEIÇÃO DE HOJE */}
        <div className="p-5 rounded-2xl border-2 border-forest/20 bg-surface shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-forest text-white flex items-center justify-center font-bold text-xs">
              <Utensils className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Refeição de Hoje</h3>
              <p className="text-[11px] text-muted">Controle diário de almoço e janta</p>
            </div>
          </div>

          {loadingHoje ? (
            <div className="py-8 text-center text-xs text-muted">
              Verificando seu registro de hoje...
            </div>
          ) : isFimDeSemanaHoje ? (
            /* Estado: Fim de semana - Folha fechada */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-cream/60 border border-line text-center">
                <Utensils className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
                <h4 className="text-sm font-bold text-ink">Sem Folha de Misturas no fim de semana</h4>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  A Folha de Misturas funciona exclusivamente de segunda a sexta-feira. Aproveite o fim de semana!
                </p>
              </div>

              <Button
                type="button"
                full
                disabled
              >
                Folha Fechada no Fim de Semana
              </Button>
            </div>
          ) : comeuHoje ? (
            /* Estado: Já marcou que comeu */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-mint/50 border border-forest/30 text-center">
                <CheckCircle2 className="w-10 h-10 text-forest mx-auto mb-2" />
                <h4 className="text-sm font-bold text-forest">Você comeu na república hoje!</h4>
                <p className="text-xs text-forest/80 mt-1">
                  Sua refeição foi contabilizada para o fechamento da casa.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleRefeicao(false)}
                disabled={salvando}
                className="w-full py-2.5 px-3 rounded-xl border border-line bg-surface hover:bg-cream/50 text-xs font-semibold text-muted hover:text-clay transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{salvando ? 'Cancelando...' : 'Desfazer (não comi hoje)'}</span>
              </button>
            </div>
          ) : (
            /* Estado: Ainda não marcou */
            <div className="space-y-4">
              <p className="text-xs text-muted text-center leading-relaxed">
                Você ainda não registrou refeição hoje. Caso tenha almoçado ou jantado na casa, basta tocar no botão abaixo:
              </p>

              <Button
                type="button"
                full
                disabled={salvando}
                onClick={() => handleToggleRefeicao(true)}
              >
                {salvando ? 'Salvando...' : '🍽️ Comi na República Hoje'}
              </Button>
            </div>
          )}
        </div>

        {/* RESUMO MENSAL PARA O CONVIDADO */}
        <div className="p-4 rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-forest" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Suas Refeições em {mesCapitalizado}
              </h4>
            </div>
            <span className="text-xs font-bold text-forest bg-mint px-2 py-0.5 rounded-full">
              {totalMes} {totalMes === 1 ? 'refeição' : 'refeições'}
            </span>
          </div>

          {loadingHistorico ? (
            <p className="text-xs text-muted py-2 text-center">Carregando histórico...</p>
          ) : totalMes === 0 ? (
            <p className="text-xs text-muted py-2 text-center">
              Nenhuma refeição registrada neste mês ainda.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {diasMes.map((diaStr) => (
                <div
                  key={diaStr}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-cream/40 text-xs border border-line/60"
                >
                  <span className="font-medium text-ink">
                    {formatarDataExtenso(diaStr)}
                  </span>
                  <span className="text-[11px] font-semibold text-forest">
                    1 refeição
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-line/60 text-[11px] text-muted leading-relaxed">
            💡 O fechamento e cobrança das refeições é realizado mensalmente pela Frente Financeiro (Caixinha).
          </div>
        </div>
      </main>

      {/* Rodapé institucional */}
      <footer className="px-5 py-4 text-center border-t border-line text-[11px] text-muted">
        República Canta Grillo · Desde 2004
      </footer>
    </div>
  );
};
