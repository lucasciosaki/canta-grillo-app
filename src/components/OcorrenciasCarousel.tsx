import React, { useState } from 'react';
import { X, Send, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import type { Ocorrencia } from '../data/ocorrenciasMock';
import { Button, Tag } from './ui';

interface OcorrenciasCarouselProps {
  ocorrencias: Ocorrencia[];
  onAssumirPonto: (id: string) => void;
  onEnviarMensagem: (id: string, texto: string) => void;
}

export const OcorrenciasCarousel: React.FC<OcorrenciasCarouselProps> = ({
  ocorrencias,
  onAssumirPonto,
  onEnviarMensagem,
}) => {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [novaMensagem, setNovaMensagem] = useState('');

  // Filtra apenas as ocorrências pendentes (abertas)
  const pendentes = ocorrencias.filter((o) => o.status === 'aberta');
  const selecionada = ocorrencias.find((o) => o.id === selecionadaId);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = (direcao: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const larguraItem = scrollRef.current.clientWidth;
    const novoScroll =
      direcao === 'left'
        ? scrollRef.current.scrollLeft - larguraItem
        : scrollRef.current.scrollLeft + larguraItem;

    scrollRef.current.scrollTo({ left: novoScroll, behavior: 'smooth' });
  };

  const handleEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !selecionadaId) return;
    onEnviarMensagem(selecionadaId, novaMensagem.trim());
    setNovaMensagem('');
  };

  if (pendentes.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted">Pontos denunciados</h3>
          <Tag tone="alert">{pendentes.length} pendentes</Tag>
        </div>

        {pendentes.length > 4 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleScroll('left')}
              className="p-1 rounded text-muted hover:text-ink transition-colors"
              aria-label="Ver anteriores"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll('right')}
              className="p-1 rounded text-muted hover:text-ink transition-colors"
              aria-label="Ver próximos"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Carrossel mostrando 4 fotos por vez */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {pendentes.map((oc) => (
          <button
            key={oc.id}
            onClick={() => setSelecionadaId(oc.id)}
            className="shrink-0 w-[calc((100%-30px)/4)] snap-start text-left group focus:outline-none"
          >
            <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-line bg-surface group-hover:border-muted transition-colors">
              <img
                src={oc.foto}
                alt={oc.titulo}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-ink/75 text-white text-[9px] font-medium leading-none">
                1 pt
              </span>
            </div>
            <p className="text-[11px] font-medium text-ink truncate mt-1 leading-tight">
              {oc.titulo}
            </p>
            <p className="text-[10px] text-muted truncate leading-tight">
              {oc.local}
            </p>
          </button>
        ))}
      </div>

      {/* Modal focado no centro da tela com foto + thread de discussão */}
      {selecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-150">
          {/* Card central focado */}
          <div
            className="w-full max-w-sm max-h-[90dvh] flex flex-col bg-surface border border-line rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do modal com título e fechar */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-ink truncate">
                    {selecionada.titulo}
                  </h4>
                  <Tag tone="alert">Pendente</Tag>
                </div>
                <p className="text-xs text-muted truncate mt-0.5">
                  {selecionada.local} · Denunciado por {selecionada.relator}
                </p>
              </div>
              <button
                onClick={() => setSelecionadaId(null)}
                className="p-1 rounded text-muted hover:text-ink transition-colors shrink-0"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo rolável: Foto em destaque + Ação de assumir + Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Foto destacada no centro */}
              <div className="w-full aspect-[4/3] rounded-lg overflow-hidden border border-line bg-paper">
                <img
                  src={selecionada.foto}
                  alt={selecionada.titulo}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Botão de assunção de culpa */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-paper border border-line">
                <div>
                  <p className="text-xs font-semibold text-ink">Foi você?</p>
                  <p className="text-[11px] text-muted">Assumir credita 1 ponto no seu perfil</p>
                </div>
                <Button
                  onClick={() => {
                    onAssumirPonto(selecionada.id);
                    setSelecionadaId(null);
                  }}
                >
                  Assumir ponto
                </Button>
              </div>

              {/* Thread de discussão */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <MessageCircle className="w-3.5 h-3.5 text-muted" />
                  <h5 className="text-xs font-semibold text-ink">
                    Discussão ({selecionada.mensagens.length})
                  </h5>
                </div>

                {selecionada.mensagens.length === 0 ? (
                  <p className="text-xs text-muted py-2 text-center bg-paper rounded-lg border border-line">
                    Nenhuma mensagem ainda. Quem foi o responsável?
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selecionada.mensagens.map((msg, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-paper border border-line text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-ink">{msg.autor}</span>
                          <span className="text-[10px] text-muted">{msg.hora}</span>
                        </div>
                        <p className="text-muted leading-relaxed">{msg.texto}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Campo de envio de nova mensagem na thread */}
            <form
              onSubmit={handleEnviar}
              className="p-3 border-t border-line bg-surface flex items-center gap-2"
            >
              <input
                type="text"
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                placeholder="Escreva na discussão..."
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-line bg-paper text-ink placeholder:text-muted focus:outline-none focus:border-forest"
              />
              <button
                type="submit"
                disabled={!novaMensagem.trim()}
                className="p-2 rounded-lg bg-forest text-white disabled:opacity-40 hover:bg-forest-dark transition-colors shrink-0"
                aria-label="Enviar mensagem"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
