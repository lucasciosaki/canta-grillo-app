import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { ResumoConvidadoFinanceiro } from '../../../types/frentes';
import {
  calcularRelatorioExternosMes,
  obterMesAnoAtual,
} from '../../../types/frentes';
import { Tag } from '../../../components/ui';
import {
  DollarSign,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageCircle,
} from 'lucide-react';

interface FrenteFinanceiroTabProps {
  isAdmin?: boolean;
}

export const FrenteFinanceiroTab: React.FC<FrenteFinanceiroTabProps> = () => {
  const [mesAnoCiclo, setMesAnoCiclo] = useState(() => obterMesAnoAtual());
  const [relatorio, setRelatorio] = useState<ResumoConvidadoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarDadosFinanceiro = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Busca perfis com role = 'externo'
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nome, apelido, telefone_contato, role')
        .eq('role', 'externo');

      const convidados = profilesData || [];

      // 2. Busca refeições do mês
      const [ano, mes] = mesAnoCiclo.split('-').map(Number);
      const primeiroDia = `${mesAnoCiclo}-01`;
      const ultimoDiaData = new Date(ano, mes, 0);
      const ultimoDia = `${mesAnoCiclo}-${String(ultimoDiaData.getDate()).padStart(2, '0')}`;

      const { data: mealsData } = await supabase
        .from('daily_meals')
        .select('usuario_id, data, misturas_consumidas')
        .gte('data', primeiroDia)
        .lte('data', ultimoDia)
        .gt('misturas_consumidas', 0);

      const refeicoes = (mealsData || []).map((m) => ({
        usuario_id: m.usuario_id,
        data: m.data,
        misturas_consumidas: Number(m.misturas_consumidas),
      }));

      // 3. Processa relatório consolidado com função pura
      const consolidado = calcularRelatorioExternosMes(
        convidados,
        refeicoes,
        mesAnoCiclo
      );

      setRelatorio(consolidado);
    } catch (err) {
      console.error('[FrenteFinanceiroTab] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [mesAnoCiclo]);

  useEffect(() => {
    carregarDadosFinanceiro();
  }, [carregarDadosFinanceiro]);

  // Realtime subscription na tabela daily_meals
  useEffect(() => {
    const channel = supabase
      .channel('financeiro-daily-meals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_meals' },
        () => carregarDadosFinanceiro()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarDadosFinanceiro]);

  const navegarMes = (delta: number) => {
    const [ano, mes] = mesAnoCiclo.split('-').map(Number);
    const novaData = new Date(ano, mes - 1 + delta, 1);
    setMesAnoCiclo(obterMesAnoAtual(novaData));
  };

  const formatarMesAno = (ciclo: string) => {
    const [ano, mes] = ciclo.split('-').map(Number);
    const data = new Date(ano, mes - 1, 1);
    const mesNome = data.toLocaleDateString('pt-BR', { month: 'long' });
    return `${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} de ${ano}`;
  };

  const totalGeralRefeicoes = relatorio.reduce(
    (acc, item) => acc + item.total_refeicoes,
    0
  );

  return (
    <div className="space-y-5">
      {/* Seletor de Ciclo Mensal */}
      <div className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between">
        <button
          type="button"
          onClick={() => navegarMes(-1)}
          className="p-1 text-muted hover:text-ink rounded transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-xs font-bold text-ink tracking-tight">
            {formatarMesAno(mesAnoCiclo)}
          </p>
          <p className="text-[10px] text-muted">
            Acerto de contas de refeições com a Caixinha
          </p>
        </div>
        <button
          type="button"
          onClick={() => navegarMes(1)}
          className="p-1 text-muted hover:text-ink rounded transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl border border-line bg-surface space-y-1 shadow-2xs">
          <span className="text-[11px] font-medium text-muted flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-forest" />
            Total Refeições Externos
          </span>
          <p className="text-2xl font-bold text-ink">{totalGeralRefeicoes}</p>
          <p className="text-[10px] text-muted">consumidas no mês</p>
        </div>

        <div className="p-3.5 rounded-xl border border-line bg-surface space-y-1 shadow-2xs">
          <span className="text-[11px] font-medium text-muted flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-forest" />
            Convidados Ativos
          </span>
          <p className="text-2xl font-bold text-ink">{relatorio.length}</p>
          <p className="text-[10px] text-muted">com refeições registradas</p>
        </div>
      </div>

      {/* Lista Consolidada por Convidado Externo */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Consolidação por Convidado
        </h4>

        {loading ? (
          <div className="py-12 text-center text-xs text-muted">
            Carregando apuração financeira...
          </div>
        ) : relatorio.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-line rounded-xl bg-surface/50 space-y-1">
            <Calendar className="w-7 h-7 text-muted mx-auto mb-2" />
            <p className="text-sm font-medium text-ink">Nenhuma refeição externa neste mês!</p>
            <p className="text-xs text-muted">
              Nenhum convidado marcou almoço ou janta na república em {formatarMesAno(mesAnoCiclo)}.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {relatorio.map((item) => {
              const telLimpo = item.telefone_contato?.replace(/\D/g, '');
              const linkWhatsapp = telLimpo
                ? `https://wa.me/55${telLimpo}?text=Ol%C3%A1%20${encodeURIComponent(
                    item.apelido
                  )},%20fechamento%20das%20refei%C3%A7%C3%B5es%20na%20Canta%20Grillo%20em%20${encodeURIComponent(
                    formatarMesAno(mesAnoCiclo)
                  )}:%20voc%C3%AA%20teve%20${item.total_refeicoes}%20refei%C3%A7%C3%B5es%20registradas.`
                : null;

              return (
                <div
                  key={item.convidado_id}
                  className="p-3.5 rounded-xl border border-line bg-surface space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.apelido}</p>
                      {item.telefone_contato && (
                        <p className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-muted" />
                          {item.telefone_contato}
                        </p>
                      )}
                    </div>
                    <Tag tone="green">
                      {item.total_refeicoes} {item.total_refeicoes === 1 ? 'refeição' : 'refeições'}
                    </Tag>
                  </div>

                  {/* Dias consumidos */}
                  <div className="pt-2 border-t border-line/60">
                    <p className="text-[10px] text-muted mb-1 font-medium">Dias consumidos:</p>
                    <div className="flex flex-wrap gap-1">
                      {item.datas_consumo.map((d) => (
                        <span
                          key={d}
                          className="px-2 py-0.5 rounded bg-paper border border-line text-[10px] text-ink font-medium"
                        >
                          {d.split('-').reverse().slice(0, 2).join('/')}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Botão de contato via WhatsApp */}
                  {linkWhatsapp && (
                    <div className="pt-1 flex justify-end">
                      <a
                        href={linkWhatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest hover:underline"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Cobrar via WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
