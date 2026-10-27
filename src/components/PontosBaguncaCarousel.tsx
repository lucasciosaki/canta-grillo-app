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
  Check,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import type {
  PontoBagunca,
  MensagemPontoBagunca,
} from '../types/pontosBagunca';
import { calcularPrazo24h } from '../types/pontosBagunca';
import { Button, Tag } from './ui';

interface PontosBaguncaCarouselProps {
  pontos: PontoBagunca[];
  currentUserId?: string;
  visualizacoesIds: Set<string>; // IDs dos pontos que o morador logado já abriu
  inocenciasIds?: Set<string>; // IDs dos pontos onde o morador logado declarou inocência
  perfis?: Array<{ id: string; nome: string; apelido: string | null; avatar_url?: string | null }>;
  onAbrirPonto: (id: string) => void | Promise<void>;
  onAssumirPonto: (id: string) => void | Promise<void>;
  onDeclararInocencia?: (id: string) => void | Promise<void>;
  onAcusarMorador?: (pontoId: string, acusadoId: string) => void | Promise<void>;
  onEnviarMensagem: (id: string, texto: string) => void | Promise<void>;
  onNovaDenunciaClick?: () => void;
  mensagensMap?: Record<string, MensagemPontoBagunca[]>;
}

export const PontosBaguncaCarousel: React.FC<PontosBaguncaCarouselProps> = ({
  pontos,
  currentUserId,
  visualizacoesIds,
  inocenciasIds = new Set(),
  perfis = [],
  onAbrirPonto,
  onAssumirPonto,
  onDeclararInocencia,
  onAcusarMorador,
  onEnviarMensagem,
  onNovaDenunciaClick,
  mensagensMap = {},
}) => {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [assumindo, setAssumindo] = useState(false);
  const [declarandoInocente, setDeclarandoInocente] = useState(false);
  const [acusando, setAcusando] = useState(false);
  const [mostrarSeletorAcusar, setMostrarSeletorAcusar] = useState(false);
  const [acusadoSelecionadoId, setAcusadoSelecionadoId] = useState<string>('');

  // Filtra apenas pontos em aberto (permanecem visíveis durante as 24h mesmo com assunções)
  const pendentes = pontos.filter((p) => p.status === 'aberta');
  const selecionada = pontos.find((p) => p.id === selecionadaId);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = (direcao: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const larguraItem = scrollRef.current.clientWidth / 2;
    const novoScroll =
      direcao === 'left'
        ? scrollRef.current.scrollLeft - larguraItem
        : scrollRef.current.scrollLeft + larguraItem;

    scrollRef.current.scrollTo({ left: novoScroll, behavior: 'smooth' });
  };

  const handleCardClick = (pontoId: string) => {
    onAbrirPonto(pontoId);
    setSelecionadaId(pontoId);
    setMostrarSeletorAcusar(false);
    setAcusadoSelecionadoId('');
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
    try {
      await onAssumirPonto(selecionadaId);
    } finally {
      setAssumindo(false);
    }
  };

  const handleDeclararInocente = async () => {
    if (!selecionadaId || !onDeclararInocencia) return;
    setDeclarandoInocente(true);
    try {
      await onDeclararInocencia(selecionadaId);
    } finally {
      setDeclarandoInocente(false);
    }
  };

  const handleConfirmarAcusacao = async () => {
    if (!selecionadaId || !acusadoSelecionadoId || !onAcusarMorador) return;
    setAcusando(true);
    try {
      await onAcusarMorador(selecionadaId, acusadoSelecionadoId);
      setMostrarSeletorAcusar(false);
      setAcusadoSelecionadoId('');
    } finally {
      setAcusando(false);
    }
  };

  const mensagensDaSelecionada = selecionadaId ? mensagensMap[selecionadaId] || [] : [];

  // Obter perfil formatado
  const getNomeMorador = (m?: { nome?: string; apelido?: string | null } | null) => {
    if (!m) return 'Morador';
    return m.apelido || m.nome || 'Morador';
  };

  return (
    <section className="mb-8">
      {/* Cabeçalho da seção com Botão de Denúncia */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ink">Pontos de Bagunça</h3>
          {pendentes.length > 0 ? (
            <Tag tone="alert">{pendentes.length} no ar (24h)</Tag>
          ) : (
            <Tag tone="green">Casa organizada</Tag>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onNovaDenunciaClick && (
            <button
              onClick={onNovaDenunciaClick}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-forest text-white text-xs font-semibold hover:bg-forest-dark transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Denunciar</span>
            </button>
          )}

          {pendentes.length > 2 && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => handleScroll('left')}
                className="p-1 rounded text-muted hover:text-ink transition-colors cursor-pointer"
                aria-label="Ver anteriores"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleScroll('right')}
                className="p-1 rounded text-muted hover:text-ink transition-colors cursor-pointer"
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
        /* Carrossel Exibindo 2 Cards Amplos por vez (w-[calc((100%-12px)/2)]) */
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {pendentes.map((pb) => {
            const isRelator = pb.relator_id === currentUserId;
            const jaVisualizou = visualizacoesIds.has(pb.id) || isRelator;
            const prazo = calcularPrazo24h(pb.created_at);

            // Verificações de culpados e acusações
            const culpadosList = pb.culpados || [];
            const acusacoesList = pb.acusacoes || [];
            const jaAssumiuUsuario = currentUserId
              ? culpadosList.some((c) => c.morador_id === currentUserId) || pb.culpado_id === currentUserId
              : false;
            const declarouInocenteUsuario = inocenciasIds.has(pb.id);
            const foiAcusadoUsuario = currentUserId
              ? acusacoesList.some((a) => a.acusado_id === currentUserId && a.status === 'pendente')
              : false;

            // Nomes de quem assumiu
            const nomesCulpados = culpadosList
              .map((c) => getNomeMorador(c.morador))
              .filter(Boolean);
            if (pb.culpado && !nomesCulpados.includes(getNomeMorador(pb.culpado))) {
              nomesCulpados.unshift(getNomeMorador(pb.culpado));
            }

            return (
              <button
                key={pb.id}
                onClick={() => handleCardClick(pb.id)}
                className="shrink-0 w-[calc((100%-12px)/2)] snap-start text-left group focus:outline-none cursor-pointer"
              >
                <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-line bg-surface group-hover:border-forest/50 transition-all shadow-2xs">
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
                    <div className="absolute inset-0 bg-ink/30 flex flex-col items-center justify-center p-2 text-center">
                      <div className="w-8 h-8 rounded-full bg-surface/90 text-forest flex items-center justify-center shadow-xs mb-1">
                        <Eye className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold text-white tracking-tight drop-shadow">
                        Ver Foto
                      </span>
                    </div>
                  )}

                  {/* Tag do prazo de 24h */}
                  <span
                    className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none shadow-xs ${
                      prazo.expirado
                        ? 'bg-clay text-white'
                        : !jaVisualizou
                        ? 'bg-amber-500 text-white'
                        : 'bg-ink/80 text-white'
                    }`}
                  >
                    {prazo.expirado ? 'Exp.' : `${prazo.horasRestantes}h rest.`}
                  </span>

                  {/* Status pessoal do morador no topo */}
                  <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 max-w-[85%]">
                    {jaAssumiuUsuario ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-forest text-white text-[9px] font-bold flex items-center gap-0.5 shadow-xs">
                        <Check className="w-2.5 h-2.5" /> Assumiu
                      </span>
                    ) : declarouInocenteUsuario ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-sky-600 text-white text-[9px] font-bold flex items-center gap-0.5 shadow-xs">
                        <ShieldCheck className="w-2.5 h-2.5" /> Inocente
                      </span>
                    ) : foiAcusadoUsuario ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-clay text-white text-[9px] font-bold flex items-center gap-0.5 shadow-xs animate-pulse">
                        ⚠️ Acusado
                      </span>
                    ) : isRelator ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-ink/80 text-white text-[9px] font-medium shadow-xs">
                        Seu relato
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-bold shadow-xs">
                        Falta interagir
                      </span>
                    )}
                  </div>
                </div>

                {/* Descrição e Culpados */}
                <p className="text-xs font-bold text-ink truncate mt-1.5 leading-tight">
                  {pb.local_descricao}
                </p>

                {nomesCulpados.length > 0 ? (
                  <p className="text-[10px] text-forest font-semibold truncate leading-tight mt-0.5">
                    Assumido: {nomesCulpados.join(', ')}
                  </p>
                ) : acusacoesList.length > 0 ? (
                  <p className="text-[10px] text-amber-700 font-medium truncate leading-tight mt-0.5">
                    Acusado: {acusacoesList.map((a) => getNomeMorador(a.acusado)).filter(Boolean).join(', ')}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted truncate leading-tight mt-0.5">
                    {prazo.label}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Modal Detalhado com Foto Nítida + Múltiplas Assunções + Inocência + Acusações + Thread */}
      {selecionada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/65 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelecionadaId(null)}
        >
          <div
            className="w-full max-w-md max-h-[92dvh] flex flex-col bg-surface border border-line rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150"
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
                  Denunciado por {getNomeMorador(selecionada.relator)}
                </p>
              </div>
              <button
                onClick={() => setSelecionadaId(null)}
                className="p-1 rounded-lg text-muted hover:text-ink transition-colors shrink-0 cursor-pointer"
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
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      prazo.expirado
                        ? 'bg-clay-tint border-clay/30 text-clay'
                        : 'bg-cream/60 border-line text-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {prazo.expirado ? (
                        <AlertTriangle className="w-4 h-4 text-clay shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-forest shrink-0" />
                      )}
                      <div>
                        <span className="font-semibold text-ink block">{prazo.label}</span>
                        <span className="text-[10px] text-muted">
                          Fica 24h no carrossel. Todos devem assumir ou declarar inocência.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Seção de Culpados (Moradores que já assumiram) */}
              {(() => {
                const culpados = selecionada.culpados || [];
                const temCulpados = culpados.length > 0 || Boolean(selecionada.culpado_id);
                const nomes = culpados.map((c) => getNomeMorador(c.morador)).filter(Boolean);
                if (selecionada.culpado && !nomes.includes(getNomeMorador(selecionada.culpado))) {
                  nomes.unshift(getNomeMorador(selecionada.culpado));
                }

                if (!temCulpados) return null;

                return (
                  <div className="p-3 rounded-xl bg-mint/40 border border-mint/70 text-xs">
                    <div className="flex items-center gap-1.5 text-forest font-bold mb-1">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Assumido por: {nomes.join(', ')}</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Cada morador que assumiu recebeu 1 ponto individual creditado. Outros moradores que também participaram ainda podem assumir juntos!
                    </p>
                  </div>
                );
              })()}

              {/* Interação Obrigatória do Morador Atual */}
              {(() => {
                const isRelator = selecionada.relator_id === currentUserId;
                const culpados = selecionada.culpados || [];
                const jaAssumiu = currentUserId
                  ? culpados.some((c) => c.morador_id === currentUserId) || selecionada.culpado_id === currentUserId
                  : false;
                const declarouInocente = inocenciasIds.has(selecionada.id);
                const acusacaoAtual = (selecionada.acusacoes || []).find(
                  (a) => a.acusado_id === currentUserId
                );

                return (
                  <div className="p-3.5 rounded-xl bg-paper border border-line space-y-3">
                    <div>
                      <h5 className="text-xs font-bold text-ink flex items-center justify-between">
                        <span>Sua Manifestação</span>
                        {jaAssumiu ? (
                          <span className="text-[11px] font-bold text-forest flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Você Assumiu
                          </span>
                        ) : declarouInocente ? (
                          <span className="text-[11px] font-bold text-sky-600 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Declarou Inocência
                          </span>
                        ) : acusacaoAtual && acusacaoAtual.status === 'pendente' ? (
                          <span className="text-[11px] font-bold text-clay">
                            ⚠️ Você foi acusado!
                          </span>
                        ) : isRelator ? (
                          <span className="text-[11px] text-muted">Relator</span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-600">
                            Pendente de Interação
                          </span>
                        )}
                      </h5>

                      <p className="text-[11px] text-muted mt-1 leading-relaxed">
                        {jaAssumiu
                          ? 'Você já assumiu este ponto. Ele foi contabilizado na sua contagem do mês.'
                          : declarouInocente
                          ? 'Você declarou não ter relação com esta bagunça. Se foi você, ainda pode assumir abaixo.'
                          : isRelator
                          ? 'Você é o relator desta ocorrência. Não precisa declarar inocência.'
                          : 'Atenção: Quem não assumir nem declarar inocência em até 24 horas leva 1 ponto de penalidade por omissão!'}
                      </p>
                    </div>

                    {/* Botões de Ação */}
                    {!jaAssumiu && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button
                          full
                          disabled={assumindo || declarandoInocente}
                          onClick={handleAssumir}
                        >
                          {assumindo
                            ? 'Assumindo...'
                            : (selecionada.culpados?.length || 0) > 0 || selecionada.culpado_id
                            ? 'Assumir Também (Fui Eu)'
                            : 'Assumir Ponto (Fui Eu)'}
                        </Button>

                        {!isRelator && !declarouInocente && (
                          <Button
                            variant="outline"
                            full
                            disabled={assumindo || declarandoInocente}
                            onClick={handleDeclararInocente}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                            {declarandoInocente ? 'Registrando...' : 'Sou Inocente'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Seção de Acusações Múltiplas */}
              <div className="p-3.5 rounded-xl bg-paper border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <UserX className="w-4 h-4 text-clay" />
                    <h5 className="text-xs font-bold text-ink">
                      Acusações ({(selecionada.acusacoes || []).length})
                    </h5>
                  </div>

                  {!mostrarSeletorAcusar && (
                    <button
                      type="button"
                      onClick={() => setMostrarSeletorAcusar(true)}
                      className="text-[11px] font-semibold text-forest hover:text-forest-dark transition-colors flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Acusar outro morador
                    </button>
                  )}
                </div>

                {/* Lista de Acusados */}
                {(selecionada.acusacoes || []).length === 0 ? (
                  <p className="text-xs text-muted py-1">
                    Nenhum morador acusado nominalmente até o momento.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {(selecionada.acusacoes || []).map((acus) => {
                      const nomeAcusado = getNomeMorador(acus.acusado);
                      const nomeAcusador = getNomeMorador(acus.acusador);
                      return (
                        <div
                          key={acus.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface border border-line text-xs"
                        >
                          <div>
                            <span className="font-bold text-ink">{nomeAcusado}</span>
                            <span className="text-[10px] text-muted block">
                              Acusado por {nomeAcusador}
                            </span>
                          </div>

                          {acus.status === 'assumido' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-forest text-white">
                              Assumiu
                            </span>
                          ) : acus.status === 'inocente' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-600 text-white">
                              Declarou inocência
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
                              Aguardando resposta
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Formulário / Seletor para Acusar outro morador */}
                {mostrarSeletorAcusar && (
                  <div className="pt-2 border-t border-line space-y-2">
                    <label className="block text-[11px] font-semibold text-ink">
                      Selecione quem você deseja acusar:
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={acusadoSelecionadoId}
                        onChange={(e) => setAcusadoSelecionadoId(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                      >
                        <option value="">Selecione um morador...</option>
                        {perfis
                          .filter(
                            (p) =>
                              p.id !== currentUserId &&
                              !(selecionada.acusacoes || []).some((a) => a.acusado_id === p.id)
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.apelido || p.nome}
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        disabled={!acusadoSelecionadoId || acusando}
                        onClick={handleConfirmarAcusacao}
                        className="px-3 py-1.5 rounded-lg bg-forest text-white text-xs font-semibold hover:bg-forest-dark transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {acusando ? 'Acusando...' : 'Acusar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setMostrarSeletorAcusar(false)}
                        className="px-3 py-1.5 rounded-lg border border-line bg-paper text-muted hover:text-ink text-xs transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
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
                className="p-2 rounded-xl bg-forest text-white disabled:opacity-40 hover:bg-forest-dark transition-colors shrink-0 cursor-pointer"
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
