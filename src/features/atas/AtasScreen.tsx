import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { PageTitle, Button, Tag } from '../../components/ui';
import {
  ExternalLink,
  Folder,
  FileText,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Calendar,
  User,
} from 'lucide-react';
import type { AtaReuniao, AtaAutor } from '../../types/atas';
import {
  isValidHttpUrl,
  formatarDataAta,
  obterApelidoAutor,
  ordenarAtas,
  podeGerenciarAtas,
  podeEditarLinkDrive,
} from '../../types/atas';
import { DRIVE_URL as FALLBACK_DRIVE } from '../../config';

interface AtasScreenProps {
  onBack: () => void;
}

export const AtasScreen: React.FC<AtasScreenProps> = ({ onBack }) => {
  const { user, profile } = useAuth();
  const podeGerenciar = podeGerenciarAtas(profile?.role, profile?.ativo);
  const podeEditarDrive = podeEditarLinkDrive(profile?.role, profile?.ativo);

  const [loading, setLoading] = useState(true);
  const [atas, setAtas] = useState<AtaReuniao[]>([]);
  const [driveUrl, setDriveUrl] = useState<string | undefined>(FALLBACK_DRIVE);

  // Estado do formulário de Ata (Criação / Edição)
  const [modalAtaAberto, setModalAtaAberto] = useState(false);
  const [ataEmEdicao, setAtaEmEdicao] = useState<AtaReuniao | null>(null);
  const [formDataAta, setFormDataAta] = useState(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  });
  const [formTituloAta, setFormTituloAta] = useState('');
  const [formUrlAta, setFormUrlAta] = useState('');
  const [salvandoAta, setSalvandoAta] = useState(false);
  const [erroAta, setErroAta] = useState<string | null>(null);

  // Estado do formulário do Link do Drive (Admin)
  const [modalDriveAberto, setModalDriveAberto] = useState(false);
  const [formDriveUrl, setFormDriveUrl] = useState('');
  const [salvandoDrive, setSalvandoDrive] = useState(false);
  const [erroDrive, setErroDrive] = useState<string | null>(null);

  // Feedback temporário
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'err'; msg: string } | null>(null);

  const exibirFeedback = (tipo: 'ok' | 'err', msg: string) => {
    setFeedback({ tipo, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Carrega atas e link do Drive do Supabase
  const carregarDados = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Carrega link do Drive
      const { data: driveData, error: driveError } = await supabase
        .from('house_settings')
        .select('valor')
        .eq('chave', 'drive_url')
        .maybeSingle();

      if (!driveError && driveData?.valor) {
        setDriveUrl(driveData.valor);
      }

      // 2. Carrega lista de perfis para associar autores
      const { data: perfisRaw } = await supabase
        .from('profiles')
        .select('id, nome, apelido');

      const perfisMap: Record<string, AtaAutor> = {};
      perfisRaw?.forEach((p) => {
        perfisMap[p.id] = p;
      });

      // 3. Carrega atas de reunião
      const { data: atasRaw, error: atasError } = await supabase
        .from('atas_reuniao')
        .select('*')
        .order('data_reuniao', { ascending: false })
        .order('created_at', { ascending: false });

      if (atasError) {
        console.error('[AtasScreen] Erro ao carregar atas:', atasError);
      } else if (atasRaw) {
        const formatadas: AtaReuniao[] = atasRaw.map((a) => ({
          ...a,
          autor: a.publicada_por ? perfisMap[a.publicada_por] || null : null,
        }));
        setAtas(ordenarAtas(formatadas));
      }
    } catch (err) {
      console.error('[AtasScreen] Erro geral ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();

    // Inscrição Realtime para atas_reuniao e house_settings
    const channel = supabase
      .channel('atas-screen-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atas_reuniao' },
        () => carregarDados()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'house_settings' },
        () => carregarDados()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarDados]);

  // Abre formulário para publicação de nova ata
  const handleAbrirNovaAta = () => {
    setAtaEmEdicao(null);
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    setFormDataAta(`${ano}-${mes}-${dia}`);
    setFormTituloAta('');
    setFormUrlAta('');
    setErroAta(null);
    setModalAtaAberto(true);
  };

  // Abre formulário para edição de ata existente
  const handleAbrirEdicaoAta = (ata: AtaReuniao) => {
    setAtaEmEdicao(ata);
    setFormDataAta(ata.data_reuniao);
    setFormTituloAta(ata.titulo || '');
    setFormUrlAta(ata.url);
    setErroAta(null);
    setModalAtaAberto(true);
  };

  // Salva ata (Insert ou Update)
  const handleSalvarAta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroAta(null);

    if (!formDataAta) {
      setErroAta('A data da reunião é obrigatória.');
      return;
    }

    if (!formUrlAta.trim()) {
      setErroAta('O link da ata é obrigatório.');
      return;
    }

    if (!isValidHttpUrl(formUrlAta.trim())) {
      setErroAta('Link inválido. Certifique-se de iniciar com http:// ou https://');
      return;
    }

    try {
      setSalvandoAta(true);
      const urlFinal = formUrlAta.trim();
      const tituloFinal = formTituloAta.trim() || null;

      if (ataEmEdicao) {
        // Atualização de ata existente
        const { error } = await supabase
          .from('atas_reuniao')
          .update({
            data_reuniao: formDataAta,
            titulo: tituloFinal,
            url: urlFinal,
          })
          .eq('id', ataEmEdicao.id);

        if (error) throw error;
        exibirFeedback('ok', 'Ata atualizada com sucesso!');
      } else {
        // Publicação de nova ata
        const { error } = await supabase.from('atas_reuniao').insert({
          data_reuniao: formDataAta,
          titulo: tituloFinal,
          url: urlFinal,
          publicada_por: user?.id || null,
        });

        if (error) throw error;
        exibirFeedback('ok', 'Nova ata publicada com sucesso!');
      }

      setModalAtaAberto(false);
      setAtaEmEdicao(null);
      await carregarDados();
    } catch (err: any) {
      console.error('[AtasScreen] Erro ao salvar ata:', err);
      setErroAta(err.message || 'Erro ao salvar ata.');
    } finally {
      setSalvandoAta(false);
    }
  };

  // Exclui ata
  const handleExcluirAta = async (ata: AtaReuniao) => {
    const nomeExibicao = ata.titulo || `Ata de ${formatarDataAta(ata.data_reuniao)}`;
    if (!window.confirm(`Tem certeza que deseja excluir "${nomeExibicao}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('atas_reuniao')
        .delete()
        .eq('id', ata.id);

      if (error) throw error;
      exibirFeedback('ok', 'Ata excluída com sucesso!');
      await carregarDados();
    } catch (err: any) {
      console.error('[AtasScreen] Erro ao excluir ata:', err);
      alert('Erro ao excluir ata: ' + (err.message || 'Falha de permissão.'));
    }
  };

  // Abre formulário para edição do Link do Drive
  const handleAbrirEdicaoDrive = () => {
    setFormDriveUrl(driveUrl || '');
    setErroDrive(null);
    setModalDriveAberto(true);
  };

  // Salva link do Drive em house_settings (Admin)
  const handleSalvarDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroDrive(null);

    if (!formDriveUrl.trim()) {
      setErroDrive('O link do Drive não pode ser vazio.');
      return;
    }

    if (!isValidHttpUrl(formDriveUrl.trim())) {
      setErroDrive('Link inválido. Deve iniciar com http:// ou https://');
      return;
    }

    try {
      setSalvandoDrive(true);
      const urlFinal = formDriveUrl.trim();

      const { error } = await supabase
        .from('house_settings')
        .upsert(
          {
            chave: 'drive_url',
            valor: urlFinal,
            descricao: 'Pasta oficial do Google Drive da República',
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'chave' }
        );

      if (error) throw error;

      setDriveUrl(urlFinal);
      setModalDriveAberto(false);
      exibirFeedback('ok', 'Link do Drive atualizado!');
      await carregarDados();
    } catch (err: any) {
      console.error('[AtasScreen] Erro ao salvar Drive:', err);
      setErroDrive(err.message || 'Erro ao salvar link do Drive.');
    } finally {
      setSalvandoDrive(false);
    }
  };

  const atasOrdenadas = useMemo(() => ordenarAtas(atas), [atas]);

  return (
    <div className="pb-12">
      <PageTitle
        title="Atas & Links da Casa"
        hint="Histórico de atas de reunião e pasta oficial do Google Drive"
        back={{ label: 'Voltar', onClick: onBack }}
      />

      {/* Alerta de Feedback Temporário */}
      {feedback && (
        <div
          className={`mb-5 p-3 rounded-xl flex items-center gap-2 text-sm ${
            feedback.tipo === 'ok'
              ? 'bg-mint/40 text-forest border border-mint'
              : 'bg-clay-tint text-clay border border-clay/30'
          }`}
        >
          {feedback.tipo === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* 1. SEÇÃO DRIVE DA REPÚBLICA */}
      <section className="mb-7">
        <h3 className="text-xs font-medium text-muted mb-2 uppercase tracking-wider">
          Drive da República
        </h3>
        <div className="p-4 rounded-xl border border-line bg-surface">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-mint text-forest shrink-0">
                <Folder className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-ink">Pasta Compartilhada</h4>
                <p className="text-xs text-muted mt-0.5 truncate">
                  {driveUrl ? driveUrl : 'Nenhum link configurado no momento'}
                </p>
              </div>
            </div>

            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-medium transition-colors shrink-0"
              >
                <span>Abrir</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {podeEditarDrive && (
            <div className="mt-3 pt-3 border-t border-line/60 flex items-center justify-between">
              <span className="text-[11px] text-muted">Apenas Administradores podem alterar</span>
              <button
                type="button"
                onClick={handleAbrirEdicaoDrive}
                className="text-xs font-medium text-forest hover:text-forest-dark inline-flex items-center gap-1"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar Link do Drive</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* MODAL / FORMULÁRIO DO DRIVE (EXCLUSIVO ADMIN) */}
      {modalDriveAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
              <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                <Folder className="w-4 h-4 text-forest" />
                Configurar Link do Google Drive
              </h3>
              <button
                onClick={() => setModalDriveAberto(false)}
                className="p-1 text-muted hover:text-ink rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarDrive} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  URL da Pasta Compartilhada *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={formDriveUrl}
                  onChange={(e) => setFormDriveUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-hidden focus:border-forest"
                />
                <p className="text-[11px] text-muted mt-1">
                  O link deve iniciar com <code>http://</code> ou <code>https://</code>.
                </p>
              </div>

              {erroDrive && (
                <div className="p-2.5 rounded-lg bg-clay-tint text-clay text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{erroDrive}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setModalDriveAberto(false)}
                >
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" disabled={salvandoDrive}>
                  {salvandoDrive ? 'Salvando...' : 'Salvar Link'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. SEÇÃO PUBLICAR NOVA ATA */}
      <section className="mb-7">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
            Atas de Reunião
          </h3>
          {podeGerenciar && (
            <button
              type="button"
              onClick={handleAbrirNovaAta}
              className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:text-forest-dark cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Ata de Reunião</span>
            </button>
          )}
        </div>

        {/* MODAL / FORMULÁRIO DE ATA (CRIAÇÃO E EDIÇÃO) */}
        {modalAtaAberto && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <FileText className="w-4 h-4 text-forest" />
                  {ataEmEdicao ? 'Editar Ata de Reunião' : 'Publicar Nova Ata'}
                </h3>
                <button
                  onClick={() => setModalAtaAberto(false)}
                  className="p-1 text-muted hover:text-ink rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSalvarAta} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-ink">
                      Data da Reunião *
                    </label>
                    {formDataAta && (
                      <span className="text-xs font-semibold text-forest">
                        {formatarDataAta(formDataAta)}
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    required
                    value={formDataAta}
                    onChange={(e) => setFormDataAta(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-hidden focus:border-forest"
                  />
                  {formDataAta && (
                    <p className="text-[11px] text-muted mt-1">
                      Data selecionada: <span className="font-medium text-ink">{formatarDataAta(formDataAta)}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink mb-1">
                    Título da Reunião (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Reunião Ordinária - Outubro"
                    value={formTituloAta}
                    onChange={(e) => setFormTituloAta(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-hidden focus:border-forest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink mb-1">
                    Link do Documento (Google Docs, PDF, etc.) *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://docs.google.com/document/d/..."
                    value={formUrlAta}
                    onChange={(e) => setFormUrlAta(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-hidden focus:border-forest"
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Deve iniciar obrigatoriamente com <code>http://</code> ou <code>https://</code>.
                  </p>
                </div>

                {erroAta && (
                  <div className="p-2.5 rounded-lg bg-clay-tint text-clay text-xs flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{erroAta}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setModalAtaAberto(false)}
                  >
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" disabled={salvandoAta}>
                    {salvandoAta
                      ? 'Salvando...'
                      : ataEmEdicao
                      ? 'Salvar Alterações'
                      : 'Publicar Ata'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* 3. SEÇÃO HISTÓRICO DE ATAS DA REPÚBLICA */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
            Histórico de Atas da República
          </h3>
          <span className="text-xs text-muted">
            {atasOrdenadas.length} {atasOrdenadas.length === 1 ? 'ata' : 'atas'}
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-muted">
            Carregando histórico de atas...
          </div>
        ) : atasOrdenadas.length === 0 ? (
          <div className="p-6 rounded-xl border border-line bg-surface text-center">
            <FileText className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-ink">Nenhuma ata cadastrada</p>
            <p className="text-xs text-muted mt-1 mb-4">
              Seja o primeiro a publicar o link de uma reunião da república!
            </p>
            {podeGerenciar && (
              <Button variant="outline" onClick={handleAbrirNovaAta}>
                Publicar Primeira Ata
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {atasOrdenadas.map((ata, index) => {
              const isUltimaAta = index === 0;
              const tituloExibicao = ata.titulo || 'Ata de Reunião';
              const dataFormatada = formatarDataAta(ata.data_reuniao);
              const autorApelido = obterApelidoAutor(ata.autor);

              return (
                <div
                  key={ata.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isUltimaAta
                      ? 'border-forest/40 bg-surface shadow-xs'
                      : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-ink truncate">
                          {tituloExibicao}
                        </h4>
                        {isUltimaAta && <Tag tone="green">Última Ata</Tag>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {dataFormatada}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          Publicada por {autorApelido}
                        </span>
                      </div>
                    </div>

                    <a
                      href={ata.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir documento da ata em nova aba"
                      className="p-2 rounded-lg bg-mint text-forest hover:bg-mint/80 transition-colors shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  {podeGerenciar && (
                    <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between text-xs">
                      <a
                        href={ata.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted hover:text-ink truncate max-w-[200px]"
                      >
                        {ata.url}
                      </a>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAbrirEdicaoAta(ata)}
                          className="p-1.5 text-muted hover:text-forest transition-colors rounded-md"
                          title="Editar ata"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluirAta(ata)}
                          className="p-1.5 text-muted hover:text-clay transition-colors rounded-md"
                          title="Excluir ata"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
