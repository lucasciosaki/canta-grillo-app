import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  message?: string;
  subtitle?: string;
  onSignOut?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Verificando acesso...',
  subtitle = 'República Canta Grillo · Desde 2004',
  onSignOut,
}) => {
  const [showEscape, setShowEscape] = useState(false);

  // Exibe botão de escape após 2 segundos se a rede estiver lenta
  useEffect(() => {
    const timer = setTimeout(() => setShowEscape(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
      <div className="w-full max-w-xs flex flex-col items-center">
        {/* Logo oficial da República com moldura sutil */}
        <div className="relative w-16 h-16 rounded-full overflow-hidden border border-line bg-surface mb-4 shadow-xs">
          <img
            src="/logo.png"
            alt="Logo Canta Grillo"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Nome e subtítulo */}
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Canta Grillo
        </h1>
        <p className="text-xs text-muted mt-0.5 mb-6">
          {subtitle}
        </p>

        {/* Linha discreta de carregamento */}
        <div className="w-32 h-1 bg-line rounded-full overflow-hidden mb-3">
          <div className="h-full bg-forest rounded-full animate-[pulse_1.2s_ease-in-out_infinite]" />
        </div>

        <p className="text-xs text-muted font-medium">
          {message}
        </p>

        {showEscape && onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="mt-6 text-[11px] text-muted hover:text-clay underline transition-colors"
          >
            Demorando para carregar? Trocar de conta
          </button>
        )}
      </div>
    </div>
  );
};
