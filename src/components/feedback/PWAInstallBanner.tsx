import React, { useState } from 'react';
import { WifiOff, Download, Share, SquarePlus, Smartphone, MoreVertical, X } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

export interface OfflineBannerProps {
  isOnline?: boolean;
}

/**
 * Barra superior discreta exibida automaticamente quando o aparelho perde conexão com a internet.
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOnline: propIsOnline }) => {
  const { isOnline: hookIsOnline } = usePWA();
  const isOnline = propIsOnline !== undefined ? propIsOnline : hookIsOnline;

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-clay-tint text-clay border-b border-clay/20 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-xs"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Você está sem conexão — exibindo dados salvos no aparelho</span>
    </div>
  );
};

export interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal visual passo a passo para orientação de instalação no Safari do iOS (iPhone / iPad).
 */
export const IOSInstructionsModal: React.FC<InstructionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl max-w-sm w-full p-5 border border-line shadow-lg text-ink relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-ink">
              Instalar no iPhone / iPad
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Adicione o Canta Grillo direto na sua tela de início
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 -mr-1 -mt-1 text-muted hover:text-ink rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 my-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-line/60">
            <div className="w-8 h-8 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 text-forest">
              <Share className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">1. Toque em Compartilhar</p>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Na barra inferior do Safari, toque no ícone de compartilhamento (quadrado com seta para cima).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-line/60">
            <div className="w-8 h-8 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 text-forest">
              <SquarePlus className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">2. Adicionar à Tela de Início</p>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Role o menu de opções para baixo e selecione <strong className="text-ink font-semibold">"Adicionar à Tela de Início"</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-mint/40 border border-brand/20 mb-4 text-xs text-forest">
          <p className="font-medium leading-relaxed">
            💡 O app abrirá em tela cheia com ícone próprio e suporte a cache offline.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl bg-forest hover:bg-forest-dark text-white text-sm font-semibold transition-colors shadow-xs"
        >
          Entendi
        </button>
      </div>
    </div>
  );
};

/**
 * Modal visual passo a passo para orientação de instalação no Android (Chrome / Edge / Samsung Internet).
 */
export const AndroidInstructionsModal: React.FC<InstructionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl max-w-sm w-full p-5 border border-line shadow-lg text-ink relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-ink">
              Instalar no Android
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Adicione o Canta Grillo direto na sua tela inicial
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 -mr-1 -mt-1 text-muted hover:text-ink rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 my-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-line/60">
            <div className="w-8 h-8 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 text-forest">
              <MoreVertical className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">1. Toque no menu do navegador</p>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                No canto superior direito do Chrome (três pontinhos <strong className="text-ink font-semibold">⋮</strong>) ou na barra de opções.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-line/60">
            <div className="w-8 h-8 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 text-forest">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">2. Instalar aplicativo</p>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Toque em <strong className="text-ink font-semibold">"Instalar aplicativo"</strong> ou <strong className="text-ink font-semibold">"Adicionar à tela inicial"</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 mb-3 text-xs text-amber-900">
          <p className="leading-relaxed">
            💬 <strong>Abriu pelo WhatsApp ou Instagram?</strong> Toque nos três pontinhos e escolha <strong className="font-semibold">"Abrir no Chrome"</strong> para conseguir instalar.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-mint/40 border border-brand/20 mb-4 text-xs text-forest">
          <p className="font-medium leading-relaxed">
            💡 O app será instalado como aplicativo nativo e funcionará offline.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl bg-forest hover:bg-forest-dark text-white text-sm font-semibold transition-colors shadow-xs"
        >
          Entendi
        </button>
      </div>
    </div>
  );
};

export interface InstallInstructionsModalProps extends InstructionsModalProps {
  platform?: 'ios' | 'android' | 'other';
}

/**
 * Modal unificado de instruções que se adapta automaticamente à plataforma do usuário (iOS ou Android).
 */
export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  isOpen,
  onClose,
  platform,
}) => {
  const { isIOS } = usePWA();
  const targetPlatform = platform ?? (isIOS ? 'ios' : 'android');

  if (targetPlatform === 'ios') {
    return <IOSInstructionsModal isOpen={isOpen} onClose={onClose} />;
  }

  return <AndroidInstructionsModal isOpen={isOpen} onClose={onClose} />;
};

export interface HomeInstallBannerProps {
  onInstall?: () => void;
}

/**
 * Banner editorial Warm Paper dispensável, exibido na Home apenas quando o app NÃO está instalado em modo standalone.
 */
export const HomeInstallBanner: React.FC<HomeInstallBannerProps> = ({ onInstall }) => {
  const {
    showHomeBanner,
    isIOS,
    isAndroid,
    canPromptInstall,
    triggerInstallPrompt,
    dismissHomeBanner,
  } = usePWA();

  const [showInstructions, setShowInstructions] = useState(false);

  if (!showHomeBanner) {
    return null;
  }

  const handleAction = async () => {
    if (onInstall) {
      onInstall();
      return;
    }

    if (isIOS) {
      setShowInstructions(true);
      return;
    }

    if (canPromptInstall) {
      const installed = await triggerInstallPrompt();
      if (!installed) {
        // Se o prompt falhar ou for cancelado, abre o tutorial com passos manuais
        setShowInstructions(true);
      }
    } else {
      // No Android quando beforeinstallprompt não disparou (ex: WhatsApp/Firefox/Chrome reset)
      setShowInstructions(true);
    }
  };

  const botaoTexto = isIOS
    ? 'Como Instalar no iPhone'
    : canPromptInstall
      ? 'Instalar Aplicativo'
      : isAndroid
        ? 'Como Instalar no Android'
        : 'Como Instalar';

  return (
    <>
      <div className="mb-5 p-4 rounded-xl bg-surface border border-line text-ink relative shadow-xs">
        <button
          type="button"
          onClick={dismissHomeBanner}
          aria-label="Dispensar aviso de instalação"
          title="Dispensar"
          className="absolute top-2.5 right-2.5 p-1 text-muted hover:text-ink rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-10 h-10 rounded-xl bg-paper border border-line flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src="/logo.png"
              alt="Canta Grillo"
              className="w-8 h-8 rounded-lg object-cover"
            />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-forest">
              Experiência Completa
            </span>
            <h4 className="text-[15px] font-semibold text-ink leading-tight mt-0.5">
              Instalar o Canta Grillo
            </h4>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Adicione à tela de início para abrir em tela cheia, sem barra do navegador e com dados disponíveis offline.
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleAction}
            className="flex-1 py-2 px-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{botaoTexto}</span>
          </button>
          <button
            type="button"
            onClick={dismissHomeBanner}
            className="py-2 px-3 rounded-lg border border-line bg-paper hover:bg-surface text-muted text-xs font-medium transition-colors"
          >
            Agora não
          </button>
        </div>
      </div>

      <InstallInstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
        platform={isIOS ? 'ios' : 'android'}
      />
    </>
  );
};

export interface CasaInstallCardProps {
  onInstall?: () => void;
}

/**
 * Card discreto na aba Casa exibido apenas quando o app NÃO está instalado em modo standalone.
 */
export const CasaInstallCard: React.FC<CasaInstallCardProps> = ({ onInstall }) => {
  const {
    showCasaCard,
    isIOS,
    isAndroid,
    canPromptInstall,
    triggerInstallPrompt,
  } = usePWA();
  const [showInstructions, setShowInstructions] = useState(false);

  if (!showCasaCard) {
    return null;
  }

  const handleAction = async () => {
    if (onInstall) {
      onInstall();
      return;
    }

    if (isIOS) {
      setShowInstructions(true);
      return;
    }

    if (canPromptInstall) {
      const installed = await triggerInstallPrompt();
      if (!installed) {
        setShowInstructions(true);
      }
    } else {
      setShowInstructions(true);
    }
  };

  const botaoTexto = isIOS
    ? 'Como Instalar'
    : canPromptInstall
      ? 'Instalar'
      : isAndroid
        ? 'Como Instalar'
        : 'Como Instalar';

  return (
    <>
      <div className="mb-7 p-4 rounded-xl border border-line bg-surface flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-mint/50 flex items-center justify-center shrink-0 text-forest">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[15px] font-semibold text-ink leading-tight">
              Instalar no Celular
            </h4>
            <p className="text-xs text-muted truncate mt-0.5">
              Tela cheia e cache offline na tela inicial
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 px-3 py-2 rounded-lg border border-line bg-paper hover:border-muted text-ink text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5 text-forest" />
          <span>{botaoTexto}</span>
        </button>
      </div>

      <InstallInstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
        platform={isIOS ? 'ios' : 'android'}
      />
    </>
  );
};
