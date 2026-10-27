import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { PageTitle, Button } from '../../components/ui';
import { Camera, AlertCircle, CheckCircle2, RotateCcw, Clock, Check, Users } from 'lucide-react';
import { uploadImageToBucket } from '../../utils/imageStorage';
import { getProfilesCached } from '../../utils/sessionDataCache';

interface DenunciaPontoScreenProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export const DenunciaPontoScreen: React.FC<DenunciaPontoScreenProps> = ({
  onBack,
  onSuccess,
}) => {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [localDescricao, setLocalDescricao] = useState('');
  const [moradoresDisponiveis, setMoradoresDisponiveis] = useState<any[]>([]);
  const [selectedAcusadosIds, setSelectedAcusadosIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    getProfilesCached('id, nome, apelido, avatar_url, role, ativo')
      .then((perfis) => {
        const outrosMoradores = (perfis || []).filter(
          (p: any) => p.ativo && p.id !== user?.id && p.role !== 'externo'
        );
        setMoradoresDisponiveis(outrosMoradores);
      })
      .catch((err) => console.error('[DenunciaPontoScreen] Erro ao carregar moradores:', err));
  }, [user?.id]);

  const toggleAcusado = (id: string) => {
    setSelectedAcusadosIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Nome do autor respeitando rigorosamente o apelido da casa
  const apelidoRelator = profile?.apelido || profile?.nome?.split(' ')[0] || 'Morador';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      const url = URL.createObjectURL(file);
      setFotoPreview(url);
      setErro(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!fotoPreview) {
      setErro('A foto da infração é obrigatória.');
      return;
    }

    if (!localDescricao.trim()) {
      setErro('Informe onde foi encontrada a bagunça (local e descrição).');
      return;
    }

    setSubmitting(true);
    setErro(null);

    try {
      let fotoUrlParaSalvar: string;

      // 1. Processa, comprime em WebP e faz upload direto para o Supabase Storage
      if (fotoFile) {
        fotoUrlParaSalvar = await uploadImageToBucket({
          bucket: 'pontos_bagunca',
          userId: user.id,
          prefix: 'ponto',
          file: fotoFile,
          maxDim: 800,
          quality: 0.72,
        });
      } else if (fotoPreview.startsWith('http')) {
        fotoUrlParaSalvar = fotoPreview;
      } else {
        throw new Error('Foto inválida ou não selecionada.');
      }

      // 2. Insere na tabela public.pontos_bagunca
      const { data: pontoCriado, error: pontoError } = await supabase
        .from('pontos_bagunca')
        .insert({
          relator_id: user.id,
          foto_url: fotoUrlParaSalvar,
          local_descricao: localDescricao.trim(),
          status: 'aberta',
        })
        .select()
        .single();

      if (pontoError) {
        throw pontoError;
      }

      // 3. Marca que o próprio relator já visualizou a foto (ele não tem blur nem toma ponto)
      if (pontoCriado) {
        await supabase
          .from('pontos_bagunca_visualizacoes')
          .insert({
            ponto_id: pontoCriado.id,
            morador_id: user.id,
          })
          .maybeSingle();

        // 4. Se acusados foram selecionados, cadastra na tabela de acusações
        if (selectedAcusadosIds.length > 0) {
          const acusacoes = selectedAcusadosIds.map((acusadoId) => ({
            ponto_id: pontoCriado.id,
            acusado_id: acusadoId,
            acusador_id: user.id,
            status: 'pendente',
          }));
          const { error: acusError } = await supabase
            .from('pontos_bagunca_acusacoes')
            .insert(acusacoes);
          if (acusError) {
            console.error('[DenunciaPontoScreen] Erro ao cadastrar acusações:', acusError);
          }
        }
      }

      setSucesso(true);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('[DenunciaPontoScreen] Erro ao cadastrar ponto:', err);
      setErro(err.message || 'Erro ao publicar denúncia.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFotoPreview(null);
    setFotoFile(null);
    setLocalDescricao('');
    setSelectedAcusadosIds([]);
    setSucesso(false);
    setErro(null);
  };

  if (sucesso) {
    return (
      <div className="pb-12 text-center">
        <PageTitle
          title="Denúncia Publicada"
          back={{ label: 'Voltar', onClick: onBack }}
        />
        <div className="p-6 rounded-2xl bg-surface border border-line mt-4 max-w-sm mx-auto shadow-xs">
          <CheckCircle2 className="w-12 h-12 text-forest mx-auto mb-3" />
          <h3 className="text-base font-bold text-ink">Ponto Aberto com Sucesso!</h3>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            A infração já está no carrossel da Home com <strong>blur</strong>. Todos os moradores têm <strong>24 horas</strong> para abrir a imagem e identificar o culpado.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Button full onClick={onBack}>
              Ver no Carrossel da Home
            </Button>
            <Button variant="outline" full onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-1 inline" /> Denunciar outra bagunça
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <PageTitle
        title="Denunciar Ponto"
        hint="Foto obrigatória com prazo de 24h para todos abrirem"
        back={{ label: 'Voltar', onClick: onBack }}
      />

      {/* Regra de 24 horas explicada de forma clara */}
      <div className="mb-5 p-3 rounded-xl bg-cream/70 border border-line flex items-start gap-2.5 text-xs text-muted">
        <Clock className="w-4 h-4 text-forest shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-ink">Regra de Convivência:</strong> Este ponto nascerá com <span className="text-ink font-semibold">blur</span> para todos na casa. Cada morador tem 24h para abrir a imagem. Quem não abrir toma ponto automático.
        </p>
      </div>

      {erro && (
        <div className="mb-4 p-3 rounded-xl bg-clay-tint border border-clay/30 text-clay text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Input file invisível */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Área de captura da foto */}
        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
            Foto da Bagunça <span className="text-clay font-bold">*</span>
          </label>

          {fotoPreview ? (
            <div className="relative aspect-video w-full rounded-xl overflow-hidden border-2 border-forest/30 bg-surface shadow-xs">
              <img
                src={fotoPreview}
                alt="Prévia da foto"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-lg bg-ink/80 text-white text-xs font-medium backdrop-blur hover:bg-ink transition-colors flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Tirar outra</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-line hover:border-forest/50 bg-surface hover:bg-cream/40 transition-colors flex flex-col items-center justify-center p-6 text-center group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-cream flex items-center justify-center text-forest group-hover:scale-105 transition-transform mb-2">
                <Camera className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-ink">
                Tirar foto ou escolher da galeria
              </span>
              <span className="text-xs text-muted mt-0.5">
                Fotografe o item fora do lugar (copo, pia, toalha, etc.)
              </span>
            </button>
          )}
        </div>

        {/* Local e Descrição */}
        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
            O que e onde está? <span className="text-clay font-bold">*</span>
          </label>
          <input
            type="text"
            required
            value={localDescricao}
            onChange={(e) => setLocalDescricao(e.target.value)}
            placeholder="Ex: Copo sujo na mesa de centro da sala"
            className="w-full px-3.5 py-3 rounded-xl border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest shadow-2xs"
          />
        </div>

        {/* Acusação Múltipla Opcional */}
        {moradoresDisponiveis.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-forest" />
                <span>Quem você acha que foi? <span className="text-muted font-normal text-[11px] lowercase">(opcional)</span></span>
              </label>
              {selectedAcusadosIds.length > 0 && (
                <span className="text-[11px] font-bold text-forest">
                  {selectedAcusadosIds.length} selecionado{selectedAcusadosIds.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted mb-2 leading-relaxed">
              Os acusados serão notificados com urgência e terão 24h para assumir ou declarar inocência.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-0.5">
              {moradoresDisponiveis.map((m) => {
                const isSelected = selectedAcusadosIds.includes(m.id);
                const nomeDisplay = m.apelido || m.nome;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => toggleAcusado(m.id)}
                    className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-forest bg-forest/10 text-forest font-bold shadow-2xs'
                        : 'border-line bg-surface text-ink hover:border-forest/40'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-mint text-forest font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={nomeDisplay} className="w-full h-full object-cover" />
                      ) : (
                        nomeDisplay.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="text-xs truncate flex-1">{nomeDisplay}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-forest shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Identificação do Relator */}
        <div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between text-xs">
          <span className="text-muted">Denunciado por:</span>
          <span className="font-semibold text-ink">{apelidoRelator} (Você)</span>
        </div>

        <div className="pt-2">
          <Button type="submit" full disabled={submitting || !fotoPreview}>
            {submitting ? 'Publicando denúncia...' : 'Publicar Ponto de Bagunça'}
          </Button>
        </div>
      </form>
    </div>
  );
};
