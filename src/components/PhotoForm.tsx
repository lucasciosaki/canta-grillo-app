import { useEffect, useRef, useState } from 'react';
import { Button, Tag } from './ui';

/**
 * Formulário de foto: abre a câmera traseira no celular, mostra a prévia
 * e permite enviar. `children` recebe campos extras (ex.: descrição).
 * O envio ainda é simulado; será ligado ao Supabase Storage nas próximas fases.
 */
export function PhotoForm({
  submitLabel,
  sentMessage,
  children,
}: {
  submitLabel: string;
  sentMessage: string;
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  };

  const reset = () => {
    setPreview(null);
    setSent(false);
  };

  if (sent) {
    return (
      <div className="py-10 text-center">
        <Tag tone="green">Enviado</Tag>
        <p className="text-[15px] text-ink mt-3">{sentMessage}</p>
        <div className="mt-6">
          <Button variant="outline" onClick={reset}>Enviar outra</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />

      <button
        onClick={() => inputRef.current?.click()}
        className="w-full aspect-[4/3] rounded-lg border border-dashed border-muted/50 bg-surface overflow-hidden flex items-center justify-center text-sm text-muted"
      >
        {preview ? (
          <img src={preview} alt="Prévia da foto" className="w-full h-full object-cover" />
        ) : (
          'Toque para tirar a foto'
        )}
      </button>

      {preview && (
        <Button variant="text" onClick={() => inputRef.current?.click()}>
          Tirar outra
        </Button>
      )}

      {children}

      <Button full disabled={!preview} onClick={() => setSent(true)}>
        {submitLabel}
      </Button>
    </div>
  );
}
