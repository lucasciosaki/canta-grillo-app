import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui';
import type { Front, FrontMember } from '../../types/frentes';
import type { Profile } from '../../types/auth';
import {
  obterApelidoMorador,
  verificarPermissaoAtribuicao,
  type TipoAtribuicaoFunca,
} from '../../types/funcas';
import { X, Camera, AlertCircle, Check } from 'lucide-react';

interface NovaFuncaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  frentes: Front[];
  membrosFrentes: FrontMember[];
  todosMoradores: Profile[];
  initialFrontId?: string | null;
}

import { uploadImageToBucket } from '../../utils/imageStorage';

export const NovaFuncaModal: React.FC<NovaFuncaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  frentes,
  membrosFrentes,
  todosMoradores,
  initialFrontId,
}) => {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [frenteId, setFrenteId] = useState<string | null>(initialFrontId || null);
  const [prazo, setPrazo] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // Seleção de múltiplos responsáveis
  const [responsaveisSelecionados, setResponsaveisSelecionados] = useState<
    Array<{ moradorId: string; tipoAtribuicao: TipoAtribuicaoFunca }>
  >([]);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (initialFrontId) {
      setFrenteId(initialFrontId);
    }
  }, [initialFrontId]);

  // Limpa responsáveis ao mudar o escopo se ficarem inválidos
  useEffect(() => {
    if (!profile) return;
    setResponsaveisSelecionados((prev) =>
      prev.filter((r) => {
        const alvo = todosMoradores.find((m) => m.id === r.moradorId);
        if (!alvo) return false;
        const check = verificarPermissaoAtribuicao({
          autor: profile,
          alvo,
          frenteId,
          membrosFrentes,
        });
        return check.permitido;
      })
    );
  }, [frenteId, profile, todosMoradores, membrosFrentes]);

  if (!isOpen) return null;

  // Calcula quais moradores podem ser selecionados para atribuição no escopo atual (excluindo pessoas externas)
  const alvosPermitidos = todosMoradores
    .filter((m) => m.role === 'morador' || m.role === 'admin')
    .map((m) => {
      if (!profile) return null;
      const perm = verificarPermissaoAtribuicao({
        autor: profile,
        alvo: m,
        frenteId,
        membrosFrentes,
      });
      if (!perm.permitido || !perm.tipoAtribuicao) return null;
      return {
        morador: m,
        tipoAtribuicao: perm.tipoAtribuicao,
      };
    })
    .filter(Boolean) as Array<{ morador: Profile; tipoAtribuicao: TipoAtribuicaoFunca }>;

  const handleToggleResponsavel = (moradorId: string, tipoAtribuicao: TipoAtribuicaoFunca) => {
    setResponsaveisSelecionados((prev) => {
      const existe = prev.some((r) => r.moradorId === moradorId);
      if (existe) {
        return prev.filter((r) => r.moradorId !== moradorId);
      }
      return [...prev, { moradorId, tipoAtribuicao }];
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      const url = URL.createObjectURL(file);
      setFotoPreview(url);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    if (!titulo.trim()) {
      setErro('Informe o título da funça.');
      return;
    }

    if (!descricao.trim()) {
      setErro('Informe a descrição ou detalhes da funça.');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      let fotoUrlParaSalvar: string | null = null;

      if (fotoFile) {
        fotoUrlParaSalvar = await uploadImageToBucket({
          bucket: 'funcas',
          userId: user.id,
          prefix: 'funca',
          file: fotoFile,
          maxDim: 800,
          quality: 0.72,
        });
      }

      // 1. Insere a Funça (sempre com status 'aberta' - ciclo manual em 3 etapas)
      const { data: novaFunca, error: funcaError } = await supabase
        .from('funcas')
        .insert({
          relator_id: user.id,
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          frente_id: frenteId || null,
          prazo: prazo || null,
          foto_url: fotoUrlParaSalvar,
          status: 'aberta',
        })
        .select()
        .single();

      if (funcaError || !novaFunca) {
        throw funcaError || new Error('Falha ao criar funça.');
      }

      // 2. Se houver responsáveis selecionados, insere as atribuições
      if (responsaveisSelecionados.length > 0) {
        const atribuicoesPayload = responsaveisSelecionados.map((r) => ({
          funca_id: novaFunca.id,
          morador_id: r.moradorId,
          atribuido_por: user.id,
          tipo_atribuicao: r.tipoAtribuicao,
        }));

        const { error: atribError } = await supabase
          .from('funca_atribuicoes')
          .insert(atribuicoesPayload);

        if (atribError) {
          console.error('[NovaFuncaModal] Erro ao atribuir responsáveis:', atribError);
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[NovaFuncaModal] Erro ao salvar funça:', err);
      setErro(err.message || 'Erro ao abrir funça.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-paper border border-line rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-line bg-surface flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">Abrir Nova Funça</h3>
            <p className="text-xs text-muted">Qualquer morador pode abrir uma tarefa da casa</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
          {erro && (
            <div className="p-3 rounded-xl bg-clay-tint border border-clay/30 text-clay text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
              Título da Funça <span className="text-clay font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Trocar lâmpada do corredor ou Comprar cloro"
              className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
            />
          </div>

          {/* Escopo (Geral vs Frente) */}
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
              Escopo / Setor
            </label>
            <select
              value={frenteId || ''}
              onChange={(e) => setFrenteId(e.target.value ? e.target.value : null)}
              className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
            >
              <option value="">Geral (Casa toda / Sem frente)</option>
              {frentes.map((f) => (
                <option key={f.id} value={f.id}>
                  Frente: {f.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
              Descrição / Detalhes <span className="text-clay font-bold">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Explique o que precisa ser feito, onde encontrar materiais, etc."
              className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest resize-none"
            />
          </div>

          {/* Prazo */}
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
              Prazo para Conclusão (Opcional)
            </label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
            />
          </div>

          {/* Foto Opcional */}
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
              Foto Ilustrativa (Opcional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {fotoPreview ? (
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-line bg-surface">
                <img src={fotoPreview} alt="Foto da funça" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setFotoPreview(null);
                    setFotoFile(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-ink/80 text-white hover:bg-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl border border-dashed border-line hover:border-forest/50 bg-surface flex items-center justify-center gap-2 text-xs text-muted hover:text-ink transition-colors"
              >
                <Camera className="w-4 h-4 text-forest" />
                <span>Anexar foto da demanda ou reparo</span>
              </button>
            )}
          </div>

          {/* Atribuir Responsáveis (Opcional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                Atribuir Responsáveis Agora (Opcional)
              </label>
              {responsaveisSelecionados.length > 0 && (
                <span className="text-[11px] text-forest font-medium">
                  {responsaveisSelecionados.length} selecionado(s)
                </span>
              )}
            </div>

            {alvosPermitidos.length === 0 ? (
              <p className="text-xs text-muted italic p-3 rounded-xl border border-line bg-surface">
                Você não possui permissão para atribuir outros moradores nesta categoria. A funça
                nascerá aberta para a reunião ou líderes.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {alvosPermitidos.map(({ morador, tipoAtribuicao }) => {
                  const isChecked = responsaveisSelecionados.some(
                    (r) => r.moradorId === morador.id
                  );
                  const apelido = obterApelidoMorador(morador);
                  const isSelf = morador.id === user?.id;

                  let labelTag = '';
                  if (isSelf) labelTag = 'Você (Autoatribuir)';
                  else if (tipoAtribuicao === 'lider_frente') labelTag = 'Membro da Frente';
                  else if (tipoAtribuicao === 'veterano_bixo')
                    labelTag = `Bixo (${morador.geracao || 'Calouro'})`;
                  else if (tipoAtribuicao === 'admin_geral') labelTag = 'Morador';

                  return (
                    <button
                      key={morador.id}
                      type="button"
                      onClick={() => handleToggleResponsavel(morador.id, tipoAtribuicao)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'border-forest bg-mint/40 text-forest'
                          : 'border-line bg-surface text-ink hover:border-muted'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold leading-tight">{apelido}</p>
                        <p className="text-[10px] text-muted">{labelTag}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          isChecked ? 'bg-forest border-forest text-white' : 'border-line bg-surface'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé com Botões */}
          <div className="pt-2 flex gap-2">
            <Button type="button" variant="outline" full onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" full disabled={salvando}>
              {salvando ? 'Salvando...' : 'Abrir Funça'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
