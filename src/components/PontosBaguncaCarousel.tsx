import React, { useState } from 'react';
import {
  X,
  Send,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Eye,
  Plus,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { PontoBagunca, MensagemPontoBagunca } from '../types/pontosBagunca';
import { calcularPrazo24h } from '../types/pontosBagunca';
import { Button, Tag } from './ui';

interface PontosBaguncaCarouselProps {
  pontos: PontoBagunca[];
  currentUserId?: string;
  visualizacoesIds: Set<string>; // IDs dos pontos que o morador logado já abriu
  onAbrirPonto: (id: string) => void;
  onAssumirPonto: (id: string) => void;
  onEnviarMensagem: (id: string, texto: string) => void;
  onNovaDenunciaClick?: () => void;
  mensagensMap?: Record<string, MensagemPontoBagunca[]>;
}

export const PontosBaguncaCarousel: React.FC<PontosBaguncaCarouselProps> = ({
  pontos,
  currentUserId,
  visualizacoesIds,
  onAbrirPonto,
  onAssumirPonto,
  onEnviarMensagem,
  onNovaDenunciaClick,
  mensagensMap = {},
}) => {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [assumindo, setAssumindo] = useState(false);

  // Filtra apenas pontos em aberto (pendentes)
  const pendentes = pontos.filter((p) => p.status === 'aberta');
  const selecionada = pontos.find((p) => p.id === selecionadaId);

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

  const handleCardClick = (pontoId: string) => {
    onAbrirPonto(pontoId);
    setSelecionadaId(pontoId);
  };

  const handleEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !selecionadaId) return;
    onEnviarMensagem(selecionadaId, novaMensagem.trim());
    setNovaMensagem('');
  };

  const handleAssumir = async () => {
    if (!selecionadaId) return;
    setAssumindo(true);
    await onAssumirPonto(selecionadaId);
    setAssumindo(false);
    setSelecionadaId(null);
  };

  const mensagensDaSelecionada = selecionadaId ? mensagensMap[selecionadaId] || [] : [];

  return (
    <section className="mb-8">
      {/* Cabeçalho da seção com Botão de Denúncia */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ink">Pontos de Bagunça</h3>
          {pendentes.length > 0 ? (
            <Tag tone="alert">{pendentes.length} pendentes</Tag>
          ) : (
            <Tag tone="green">Casa organizada</Tag>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onNovaDenunciaClick && (
            <button
              onClick={onNovaDenunciaClick}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-forest text-white text-xs font-semibold hover:bg-forest-dark transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Denunciar</span>
            </button>
          )}

          {pendentes.length > 4 && (
            <div className="flex items-center gap-0.5 ml-1">
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
      </div>

      {pendentes.length === 0 ? (
        <div className="p-4 rounded-xl border border-line bg-surface text-center">
          <p className="text-xs text-muted">Nenhum ponto de bagunça em aberto no momento.</p>
        </div>
      ) : (
        /* Carrossel com Efeito Blur para pontos não abertos pelo usuário */
        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {pendentes.map((pb) => {
            // O blur é aplicado se o morador logado AINDA NÃO visualizou e NÃO é o próprio relator
            const isRelator = pb.relator_id === currentUserId;
            const jaVisualizou = visualizacoesIds.has(pb.id) || isRelator;
            const prazo = calcularPrazo24h(pb.created_at);

            return (
              <button
                key={pb.id}
                onClick={() => handleCardClick(pb.id)}
                className="shrink-0 w-[calc((100%-30px)/4)] snap-start text-left group focus:outline-none"
              >
                <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-line bg-surface group-hover:border-forest/50 transition-all shadow-2xs">
                  {/* Foto com Blur se não foi aberta */}
                  <img
                    src={pb.foto_url || '/logo.png'}
                    alt={pb.local_descricao}
                    className={`w-full h-full object-cover transition-all duration-300 ${
                      !jaVisualizou ? 'filter blur-md scale-110 brightness-90' : 'filter-none'
                    }`}
                  />

                  {/* Overlay indicando blur e necessidade de clique */}
                  {!jaVisualizou && (
                    <div className="absolute inset-0 bg-ink/30 flex flex-col items-center justify-center p-1 text-center">
                      <div className="w-6 h-6 rounded-full bg-surface/90 text-forest flex items-center justify-center shadow-xs mb-0.5">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[9px] font-bold text-white tracking-tight leading-none drop-shadow">
                        Abrir
                      </span>
                    </div>
                  )}

                  {/* Tag do prazo de 24h ou 1pt */}
                  <span
                    className={`absolute bottom-1 right-1 px-1 py-0.5 rounded text-[8px] font-bold leading-none ${
                      prazo.expirado
                        ? 'bg-clay text-white'
                        : !jaVisualizou
                        ? 'bg-amber-500 text-white'
                        : 'bg-ink/80 text-white'
                    }`}
                  >
                    {prazo.expirado ? 'Exp.' : `${prazo.horasRestantes}h`}
                  </span>
                </div>

                <p className="text-[11px] font-semibold text-ink truncate mt-1 leading-tight">
                  {pb.local_descricao}
                </p>
                <p className="text-[10px] text-muted truncate leading-tight">
                  {prazo.label}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal focado com Foto Nítida em Alta Resolução + Thread + Assumir */}
      {selecionada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelecionadaId(null)}
        >
          <div
            className="w-full max-w-sm max-h-[90dvh] flex flex-col bg-surface border border-line rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do modal */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-ink truncate">
                    {selecionada.local_descricao}
                  </h4>
                  <Tag tone="alert">1 pt</Tag>
                </div>
                <p className="text-[11px] text-muted truncate mt-0.5">
                  Denunciado por {selecionada.relator?.apelido || selecionada.relator?.nome || 'Morador'}
                </p>
              </div>
              <button
                onClick={() => setSelecionadaId(null)}
                className="p-1 rounded-lg text-muted hover:text-ink transition-colors shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo rolável */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Foto nítida e ampla */}
              <div className="w-full aspect-[4/3] rounded-xl overflow-hidden border border-line bg-paper">
                <img
                  src={selecionada.foto_url || '/logo.png'}
                  alt={selecionada.local_descricao}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Status do Prazo das 24 Horas */}
              {(() => {
                const prazo = calcularPrazo24h(selecionada.created_at);
                return (
                  <div
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      prazo.expirado
                        ? 'bg-clay-tint border-clay/30 text-clay'
                        : 'bg-cream/60 border-line text-muted'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {prazo.expirado ? (
                        <AlertTriangle className="w-4 h-4 text-clay shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-forest shrink-0" />
                      )}
                      <span>{prazo.label}</span>
                    </div>
                    <span className="font-semibold text-ink">Regra 24h</span>
                  </div>
                );
              })()}

              {/* Botão de assunção de culpa */}
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-paper border border-line">
                <div>
                  <p className="text-xs font-bold text-ink">Foi você?</p>
                  <p className="text-[11px] text-muted">Assumir credita 1 ponto para você e encerra a cobrança das 24h</p>
                </div>
                <Button disabled={assumindo} onClick={handleAssumir}>
                  {assumindo ? 'Assumindo...' : 'Assumir ponto'}
                </Button>
              </div>

              {/* Thread de discussão */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <MessageCircle className="w-3.5 h-3.5 text-muted" />
                  <h5 className="text-xs font-bold text-ink">
                    Discussão ({mensagensDaSelecionada.length})
                  </h5>
                </div>

                {mensagensDaSelecionada.length === 0 ? (
                  <p className="text-xs text-muted py-3 text-center bg-paper rounded-xl border border-line">
                    Nenhuma mensagem ainda. Quem foi o responsável?
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {mensagensDaSelecionada.map((msg) => {
                      const hora = new Date(msg.enviada_em).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const apelidoAutor = msg.autor?.apelido || msg.autor?.nome || 'Morador';

                      return (
                        <div
                          key={msg.id}
                          className="p-2.5 rounded-xl bg-paper border border-line text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-ink">{apelidoAutor}</span>
                            <span className="text-[10px] text-muted">{hora}</span>
                          </div>
                          <p className="text-muted leading-relaxed">{msg.conteudo}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Input de mensagem */}
            <form
              onSubmit={handleEnviar}
              className="p-3 border-t border-line bg-surface flex items-center gap-2"
            >
              <input
                type="text"
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                placeholder="Escreva na discussão..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-muted/60 focus:outline-none focus:border-forest"
              />
              <button
                type="submit"
                disabled={!novaMensagem.trim()}
                className="p-2 rounded-xl bg-forest text-white disabled:opacity-40 hover:bg-forest-dark transition-colors shrink-0"
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
