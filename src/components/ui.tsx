import React from 'react';

/** Título de página com texto de apoio, voltar e ação opcionais. */
export const PageTitle: React.FC<{
  title: string;
  hint?: string;
  action?: React.ReactNode;
  back?: { label: string; onClick: () => void };
}> = ({ title, hint, action, back }) => (
  <div className="pt-2 pb-5">
    {back && (
      <button
        onClick={back.onClick}
        className="text-sm text-muted hover:text-ink transition-colors mb-2"
      >
        ‹ {back.label}
      </button>
    )}
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="text-sm text-muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  </div>
);

/** Seção com rótulo discreto e linhas divisórias (sem cartões nem sombras). */
export const Section: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="mb-7">
    {title && <h3 className="text-xs font-medium text-muted mb-1.5">{title}</h3>}
    <div className="divide-y divide-line border-y border-line">{children}</div>
  </section>
);

/** Linha de lista: título + detalhe à esquerda, conteúdo opcional à direita. */
export const Row: React.FC<{
  title: string;
  meta?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}> = ({ title, meta, right, onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 py-3 text-left"
    >
      <div className="min-w-0">
        <p className="text-[15px] text-ink truncate">{title}</p>
        {meta && <p className="text-sm text-muted mt-0.5">{meta}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </Tag>
  );
};

/** Etiqueta discreta. `alert` usa a cor complementar (terracota). */
export const Tag: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'green' | 'alert';
}> = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-line text-muted',
    green: 'bg-mint text-forest',
    alert: 'bg-clay-tint text-clay',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${tones[tone]}`}>
      {children}
    </span>
  );
};

/** Botão primário (verde sólido), contornado ou apenas texto. */
export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'outline' | 'text';
  full?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}> = ({ children, onClick, variant = 'primary', full, disabled, type = 'button' }) => {
  const styles = {
    primary:
      'px-4 py-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-sm font-medium disabled:opacity-40',
    outline:
      'px-4 py-3 rounded-lg border border-line bg-surface hover:border-muted text-ink text-sm font-medium disabled:opacity-40',
    text: 'text-sm font-medium text-forest hover:text-forest-dark',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles[variant]} ${full ? 'w-full' : ''} transition-colors`}
    >
      {children}
    </button>
  );
};

/**
 * Botão contornado que abre um link externo em nova aba.
 * Sem `href`, aparece desativado com o texto alternativo `emptyLabel`.
 */
export const LinkButton: React.FC<{
  href?: string;
  children: React.ReactNode;
  emptyLabel: string;
}> = ({ href, children, emptyLabel }) => {
  const base =
    'px-4 py-3 rounded-lg border border-line bg-surface text-sm font-medium text-center transition-colors';
  if (!href) {
    return (
      <span aria-disabled="true" className={`${base} text-muted opacity-60`}>
        {emptyLabel}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} text-ink hover:border-muted`}
    >
      {children}
    </a>
  );
};
