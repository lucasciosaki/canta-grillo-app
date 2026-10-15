import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../types/auth';
import { PageTitle, Tag } from '../../components/ui';
import { Check, X } from 'lucide-react';

interface AprovacoesScreenProps {
  onBack: () => void;
}

export const AprovacoesScreen: React.FC<AprovacoesScreenProps> = ({ onBack }) => {
  const [pendentes, setPendentes] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const carregarPendentes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, quarto:rooms(*)')
      .eq('ativo', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPendentes(data as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarPendentes();
  }, []);

  const handleAprovar = async (id: string) => {
    setActionLoading(id);
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: true })
      .eq('id', id);

    if (!error) {
      setPendentes((prev) => prev.filter((p) => p.id !== id));
    } else {
      alert('Erro ao aprovar morador: ' + error.message);
    }
    setActionLoading(null);
  };

  const handleRecusar = async (id: string) => {
    if (!confirm('Deseja recusar e remover esta solicitação de morador?')) return;
    setActionLoading(id);
    const { error } = await supabase.from('profiles').delete().eq('id', id);

    if (!error) {
      setPendentes((prev) => prev.filter((p) => p.id !== id));
    } else {
      alert('Erro ao recusar solicitação: ' + error.message);
    }
    setActionLoading(null);
  };

  return (
    <>
      <PageTitle
        title="Aprovações de Moradores"
        hint="Controle de acesso à casa (exclusivo Admin)"
        back={{ label: 'Casa', onClick: onBack }}
      />

      {loading ? (
        <p className="text-xs text-muted py-6 text-center">Buscando cadastros pendentes...</p>
      ) : pendentes.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-10 h-10 rounded-full bg-mint text-forest flex items-center justify-center mx-auto mb-3">
            <Check className="w-5 h-5" />
          </div>
          <h4 className="text-base font-semibold text-ink">Nenhuma solicitação pendente</h4>
          <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
            Todos os moradores cadastrados já foram aprovados. Novos cadastros aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">
            {pendentes.length} {pendentes.length === 1 ? 'morador aguardando' : 'moradores aguardando'}
          </p>

          {pendentes.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-xl border border-line bg-surface space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    {p.nome} {p.apelido && <span className="text-muted">({p.apelido})</span>}
                  </h4>
                  <p className="text-xs text-muted mt-0.5">
                    Geração {p.geracao || '025'} · {p.quarto?.nome || 'Quarto não definido'}
                  </p>
                  <p className="text-[11px] text-muted/80 font-mono mt-0.5">{p.email}</p>
                </div>
                <Tag tone="alert">Pendente</Tag>
              </div>

              <div className="flex gap-2 pt-1 border-t border-line">
                <button
                  onClick={() => handleAprovar(p.id)}
                  disabled={actionLoading === p.id}
                  className="flex-1 py-2 px-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {actionLoading === p.id ? 'Aprovando...' : 'Aprovar Morador'}
                </button>

                <button
                  onClick={() => handleRecusar(p.id)}
                  disabled={actionLoading === p.id}
                  className="py-2 px-3 rounded-lg border border-line bg-paper hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
