import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import type { DogsRefeicaoDiaria, TurnoDogs } from '../../../types/frentes';
import {
  obterApelidoFrente,
  obterStatusChecklistDogsDia,
} from '../../../types/frentes';
import { getLocalDateString, formatarDataExtenso } from '../../../types/refeicoes';
import { Tag, Button } from '../../../components/ui';
import { Check, Clock, Trash2, Sun, Moon } from 'lucide-react';

interface FrenteDogsTabProps {
  compact?: boolean;
  onSuccess?: () => void;
}

export const FrenteDogsTab: React.FC<FrenteDogsTabProps> = ({ compact = false, onSuccess }) => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [hojeStr] = useState(() => getLocalDateString());
  const [refeicoesHoje, setRefeicoesHoje] = useState<DogsRefeicaoDiaria[]>([]);
  const [historico7Dias, setHistorico7Dias] = useState<DogsRefeicaoDiaria[]>([]);
  const [loading, setLoading] = useState(true);

  const [obsManha, setObsManha] = useState('');
  const [obsNoite, setObsNoite] = useState('');
  const [salvandoTurno, setSalvandoTurno] = useState<TurnoDogs | null>(null);

  const carregarDadosDogs = useCallback(async () => {
    try {
      // 1. Refeições de Hoje
      const { data: hojeData, error: hojeError } = await supabase
        .from('dogs_refeicoes_diarias')
        .select(`
          id,
          data,
          turno,
          alimentado_por,
          horario_alimentacao,
          observacoes,
          morador:profiles(id, nome, apelido)
        `)
        .eq('data', hojeStr);

      if (!hojeError && hojeData) {
        setRefeicoesHoje(hojeData as unknown as DogsRefeicaoDiaria[]);
      }

      // 2. Histórico recente (últimos 7 dias)
      if (!compact) {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        const seteDiasStr = getLocalDateString(seteDiasAtras);

        const { data: histData } = await supabase
          .from('dogs_refeicoes_diarias')
          .select(`
            id,
            data,
            turno,
            alimentado_por,
            horario_alimentacao,
            observacoes,
            morador:profiles(id, nome, apelido)
          `)
          .gte('data', seteDiasStr)
          .neq('data', hojeStr)
          .order('data', { ascending: false });

        if (histData) {
          setHistorico7Dias(histData as unknown as DogsRefeicaoDiaria[]);
        }
      }
    } catch (err) {
      console.error('[FrenteDogsTab] Erro ao carregar dados dos dogs:', err);
    } finally {
      setLoading(false);
    }
  }, [hojeStr, compact]);

  useEffect(() => {
    carregarDadosDogs();
  }, [carregarDadosDogs]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('dogs-refeicoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dogs_refeicoes_diarias' },
        () => carregarDadosDogs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarDadosDogs]);

  const { manha, noite, completo } = obterStatusChecklistDogsDia(refeicoesHoje);

  const handleMarcarAlimentado = async (turno: TurnoDogs) => {
    if (!user?.id) return;
    setSalvandoTurno(turno);

    const obs = turno === 'manha' ? obsManha.trim() : obsNoite.trim();

    try {
      const { error } = await supabase.from('dogs_refeicoes_diarias').upsert(
        {
          data: hojeStr,
          turno,
          alimentado_por: user.id,
          horario_alimentacao: new Date().toISOString(),
          observacoes: obs || null,
        },
        { onConflict: 'data,turno' }
      );

      if (error) {
        alert('Erro ao registrar refeição: ' + error.message);
      } else {
        if (turno === 'manha') setObsManha('');
        if (turno === 'noite') setObsNoite('');
        await carregarDadosDogs();
        onSuccess?.();
      }
    } finally {
      setSalvandoTurno(null);
    }
  };

  const handleDesmarcar = async (id: string) => {
    if (!confirm('Deseja desmarcar esta refeição dos cães?')) return;
    try {
      const { error } = await supabase
        .from('dogs_refeicoes_diarias')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Erro ao desmarcar: ' + error.message);
      } else {
        await carregarDadosDogs();
      }
    } catch (err: any) {
      alert('Erro inesperado: ' + err.message);
    }
  };

  const formatarHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho da Rotina Diária */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Alimentação dos Cães</h3>
          {completo ? (
            <Tag tone="green">Dia Completo ✓</Tag>
          ) : (
            <Tag tone="alert">Pendente hoje</Tag>
          )}
        </div>
        <p className="text-xs text-muted mt-0.5">{formatarDataExtenso(hojeStr)}</p>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-muted">Carregando checklist dos cães...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Card Turno Manhã */}
          <div className="p-4 rounded-xl border border-line bg-surface space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Sun className="w-4 h-4 text-forest" />
                Refeição da Manhã
              </span>
              {manha ? (
                <Tag tone="green">Alimentado ✓</Tag>
              ) : (
                <Tag tone="alert">Pendente</Tag>
              )}
            </div>

            {manha ? (
              <div className="pt-2 border-t border-line/60 space-y-1.5 text-xs">
                <p className="text-ink font-medium">
                  Alimentado por <strong>{obterApelidoFrente(manha.morador)}</strong>
                </p>
                <p className="text-[11px] text-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted" />
                  Às {formatarHora(manha.horario_alimentacao)}
                </p>
                {manha.observacoes && (
                  <p className="text-[11px] text-muted italic bg-paper p-2 rounded border border-line">
                    "{manha.observacoes}"
                  </p>
                )}
                {(manha.alimentado_por === user?.id || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleDesmarcar(manha.id)}
                    className="text-[11px] text-clay hover:underline pt-1 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Desmarcar
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1 border-t border-line/60">
                <input
                  type="text"
                  value={obsManha}
                  onChange={(e) => setObsManha(e.target.value)}
                  placeholder="Observação opcional (ex: água trocada)..."
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-line bg-paper text-ink"
                />
                <Button
                  full
                  variant="primary"
                  onClick={() => handleMarcarAlimentado('manha')}
                  disabled={salvandoTurno === 'manha'}
                >
                  <span className="flex items-center justify-center gap-1.5 text-xs">
                    <Check className="w-3.5 h-3.5" />
                    {salvandoTurno === 'manha' ? 'Salvando...' : 'Marcar que dei comida (Manhã)'}
                  </span>
                </Button>
              </div>
            )}
          </div>

          {/* Card Turno Noite */}
          <div className="p-4 rounded-xl border border-line bg-surface space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Moon className="w-4 h-4 text-forest" />
                Refeição da Noite
              </span>
              {noite ? (
                <Tag tone="green">Alimentado ✓</Tag>
              ) : (
                <Tag tone="alert">Pendente</Tag>
              )}
            </div>

            {noite ? (
              <div className="pt-2 border-t border-line/60 space-y-1.5 text-xs">
                <p className="text-ink font-medium">
                  Alimentado por <strong>{obterApelidoFrente(noite.morador)}</strong>
                </p>
                <p className="text-[11px] text-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted" />
                  Às {formatarHora(noite.horario_alimentacao)}
                </p>
                {noite.observacoes && (
                  <p className="text-[11px] text-muted italic bg-paper p-2 rounded border border-line">
                    "{noite.observacoes}"
                  </p>
                )}
                {(noite.alimentado_por === user?.id || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleDesmarcar(noite.id)}
                    className="text-[11px] text-clay hover:underline pt-1 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Desmarcar
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1 border-t border-line/60">
                <input
                  type="text"
                  value={obsNoite}
                  onChange={(e) => setObsNoite(e.target.value)}
                  placeholder="Observação opcional..."
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-line bg-paper text-ink"
                />
                <Button
                  full
                  variant="primary"
                  onClick={() => handleMarcarAlimentado('noite')}
                  disabled={salvandoTurno === 'noite'}
                >
                  <span className="flex items-center justify-center gap-1.5 text-xs">
                    <Check className="w-3.5 h-3.5" />
                    {salvandoTurno === 'noite' ? 'Salvando...' : 'Marcar que dei comida (Noite)'}
                  </span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico dos Últimos Dias (apenas no modo completo) */}
      {!compact && historico7Dias.length > 0 && (
        <div className="pt-4 border-t border-line space-y-3">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Histórico Recente (Últimos 7 dias)
          </h4>
          <div className="divide-y divide-line border-y border-line text-xs">
            {historico7Dias.map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-ink">
                    {r.turno === 'manha' ? 'Manhã' : 'Noite'} · {r.data.split('-').reverse().slice(0, 2).join('/')}
                  </span>
                  <span className="text-muted ml-2">por {obterApelidoFrente(r.morador)}</span>
                </div>
                <span className="text-[11px] text-muted">
                  {formatarHora(r.horario_alimentacao)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
