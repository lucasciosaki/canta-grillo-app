import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import type { Front, FrontMember, MensagemFrente } from '../../../types/frentes';
import { obterApelidoFrente } from '../../../types/frentes';
import { triggerRemoteWebPush } from '../../../utils/browserPush';
import { Send, Star, MessageSquare } from 'lucide-react';

interface FrenteChatTabProps {
  frente: Front;
  membros: FrontMember[];
}

export const FrenteChatTab: React.FC<FrenteChatTabProps> = ({ frente, membros }) => {
  const { user, profile } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemFrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoTexto, setNovoTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const lideresIds = new Set(
    membros.filter((m) => m.is_lider).map((m) => m.profile_id)
  );

  const carregarMensagens = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('mensagens_frente')
        .select(`
          id,
          frente_id,
          autor_id,
          conteudo,
          enviada_em,
          autor:profiles(id, nome, apelido)
        `)
        .eq('frente_id', frente.id)
        .order('enviada_em', { ascending: true });

      if (!error && data) {
        setMensagens(data as unknown as MensagemFrente[]);
      }
    } catch (err) {
      console.error('[FrenteChatTab] Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  }, [frente.id]);

  useEffect(() => {
    carregarMensagens();
  }, [carregarMensagens]);

  // Realtime subscription para o chat interno da frente
  useEffect(() => {
    const channel = supabase
      .channel(`chat-frente-${frente.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mensagens_frente',
          filter: `frente_id=eq.${frente.id}`,
        },
        () => {
          carregarMensagens();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [frente.id, carregarMensagens]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !novoTexto.trim()) return;

    const texto = novoTexto.trim();
    setNovoTexto('');
    setEnviando(true);

    // Otimista
    const tempId = 'temp-' + Date.now();
    const mensagemOtimista: MensagemFrente = {
      id: tempId,
      frente_id: frente.id,
      autor_id: user.id,
      conteudo: texto,
      enviada_em: new Date().toISOString(),
      autor: {
        id: user.id,
        nome: profile?.nome || 'Morador',
        apelido: profile?.apelido || null,
      },
    };

    setMensagens((prev) => [...prev, mensagemOtimista]);

    try {
      const { error } = await supabase.from('mensagens_frente').insert({
        frente_id: frente.id,
        autor_id: user.id,
        conteudo: texto,
      });

      if (error) {
        alert('Erro ao enviar mensagem: ' + error.message);
        setMensagens((prev) => prev.filter((m) => m.id !== tempId));
      } else {
        const destinatarios = membros
          .map((m) => m.profile_id)
          .filter((id) => id !== user.id);
        if (destinatarios.length > 0) {
          const apelidoAutor = profile?.apelido || profile?.nome?.split(' ')[0] || 'Morador';
          triggerRemoteWebPush({
            user_ids: destinatarios,
            title: `💬 ${frente.nome} (${apelidoAutor})`,
            body: texto,
            tag: `chat-frente-${frente.id}`,
            url: '/?screen=frentes',
          });
        }
        await carregarMensagens();
      }
    } catch (err: any) {
      console.error('[FrenteChatTab] Erro:', err);
    } finally {
      setEnviando(false);
    }
  };

  const formatarHora = (iso: string) => {
    try {
      const data = new Date(iso);
      return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-[520px] rounded-xl border border-line bg-paper overflow-hidden">
      {/* Header discreto do chat */}
      <div className="p-3 border-b border-line bg-surface flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <MessageSquare className="w-3.5 h-3.5 text-forest" />
          Canal Interno da Frente
        </span>
        <span>{membros.length} participantes</span>
      </div>

      {/* Área de mensagens com scroll */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {loading ? (
          <div className="py-12 text-center text-xs text-muted">Carregando conversa...</div>
        ) : mensagens.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted space-y-1">
            <p className="font-medium text-ink">Nenhuma mensagem ainda.</p>
            <p>Inicie o papo com os outros integrantes da frente!</p>
          </div>
        ) : (
          mensagens.map((msg) => {
            const ehMeu = msg.autor_id === user?.id;
            const ehLider = lideresIds.has(msg.autor_id);
            const apelido = obterApelidoFrente(msg.autor);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${ehMeu ? 'items-end' : 'items-start'}`}
              >
                {!ehMeu && (
                  <div className="flex items-center gap-1 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-ink">
                      {apelido}
                    </span>
                    {ehLider && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded bg-mint text-forest font-bold">
                        <Star className="w-2.5 h-2.5 fill-forest" />
                        Líder
                      </span>
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-2xs ${
                    ehMeu
                      ? 'bg-forest text-white rounded-tr-xs'
                      : 'bg-surface border border-line text-ink rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.conteudo}</p>
                  <div
                    className={`mt-1 text-[9px] text-right ${
                      ehMeu ? 'text-white/70' : 'text-muted'
                    }`}
                  >
                    {formatarHora(msg.enviada_em)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Campo de Envio */}
      <form
        onSubmit={handleEnviar}
        className="p-3 border-t border-line bg-surface flex items-center gap-2"
      >
        <input
          type="text"
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          placeholder={`Mensagem para a frente ${frente.nome}...`}
          disabled={enviando}
          className="flex-1 px-3.5 py-2.5 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-forest"
        />
        <button
          type="submit"
          disabled={enviando || !novoTexto.trim()}
          className="p-2.5 rounded-xl bg-forest hover:bg-forest-dark text-white disabled:opacity-40 transition-colors shadow-2xs shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
