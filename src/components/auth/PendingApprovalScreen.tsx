import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui';
import { ShieldCheck, RefreshCw, LogOut } from 'lucide-react';

export const PendingApprovalScreen: React.FC = () => {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    await refreshProfile();
    setTimeout(() => setChecking(false), 500);
  };

  const nomeMorador =
    profile?.nome ||
    user?.user_metadata?.nome ||
    user?.email?.split('@')[0] ||
    'Morador';

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col justify-center px-6 py-12">
      <div className="w-full max-w-sm mx-auto text-center space-y-6">
        {/* Ícone de proteção/espera */}
        <div className="w-16 h-16 rounded-full bg-clay-tint text-clay border border-line flex items-center justify-center mx-auto shadow-xs">
          <ShieldCheck className="w-8 h-8 stroke-[1.8]" />
        </div>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Cadastro em Análise
          </h2>
          <p className="text-sm font-medium text-forest mt-1">
            Salve, {nomeMorador}!
          </p>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-line text-xs text-muted leading-relaxed space-y-2 text-left">
          <p>
            Sua solicitação de acesso à <strong>República Canta Grillo</strong> foi registrada com sucesso.
          </p>
          <p>
            Por segurança e privacidade da casa, um <strong>Administrador</strong> precisa aprovar seu perfil antes que você possa acessar as folhas de refeições, tarefas e escalas.
          </p>
          <p className="text-[11px] text-muted/80 pt-1 border-t border-line">
            Fale com um dos administradores da casa para agilizar a sua liberação.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <Button full onClick={handleRefresh} disabled={checking}>
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Verificando...' : 'Verificar se já fui aprovado'}
            </span>
          </Button>

          <button
            type="button"
            onClick={() => signOut()}
            className="w-full py-2.5 text-xs text-muted hover:text-clay font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
};
