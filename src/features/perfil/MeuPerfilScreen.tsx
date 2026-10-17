import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import type { Room } from '../../types/auth';
import { PageTitle, Button, Tag } from '../../components/ui';
import { validarEdicaoMeuPerfil, validarFotoPerfil } from './perfilLogic.ts';
import {
  comprimirFotoPerfil,
  uploadFotoPerfilStorage,
  removerFotoPerfilStorage,
} from './avatarService.ts';
import { Check, AlertCircle, Shield, Home, Camera, Trash2 } from 'lucide-react';

interface MeuPerfilScreenProps {
  onBack: () => void;
}

export const MeuPerfilScreen: React.FC<MeuPerfilScreenProps> = ({ onBack }) => {
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(profile?.nome || '');
  const [apelido, setApelido] = useState(profile?.apelido || '');
  const [geracao, setGeracao] = useState(profile?.geracao || '');
  const [quartoId, setQuartoId] = useState<string>(profile?.quarto_id || '');

  // Foto de Perfil
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [novaFotoFile, setNovaFotoFile] = useState<File | null>(null);
  const [fotoRemovida, setFotoRemovida] = useState(false);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  // Sincroniza se o profile carregar após montagem inicial
  useEffect(() => {
    if (profile) {
      setNome(profile.nome || '');
      setApelido(profile.apelido || '');
      setGeracao(profile.geracao || '');
      setQuartoId(profile.quarto_id || '');
      if (!novaFotoFile && !fotoRemovida) {
        setAvatarPreview(profile.avatar_url || null);
      }
    }
  }, [profile, novaFotoFile, fotoRemovida]);

  // Carrega quartos disponíveis no Supabase
  useEffect(() => {
    let isMounted = true;
    supabase
      .from('rooms')
      .select('*')
      .order('nome')
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (!error && data) {
          setRooms(data);
          if (!quartoId && data.length > 0) {
            setQuartoId(data[0].id);
          }
        }
        setLoadingRooms(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Processa seleção de nova foto de perfil
  const handleSelecionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMensagemErro(null);
    setProcessandoFoto(true);

    try {
      validarFotoPerfil({ size: file.size, type: file.type });
      const compressedDataUrl = await comprimirFotoPerfil(file);
      setAvatarPreview(compressedDataUrl);
      setNovaFotoFile(file);
      setFotoRemovida(false);
      setMensagemSucesso('Nova foto selecionada! Lembre-se de salvar as alterações.');
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (err: any) {
      console.error('[MeuPerfil] Erro ao processar foto:', err);
      setMensagemErro(err.message || 'Erro ao carregar imagem selecionada.');
    } finally {
      setProcessandoFoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove a foto de perfil
  const handleRemoverFoto = () => {
    setAvatarPreview(null);
    setNovaFotoFile(null);
    setFotoRemovida(true);
    setMensagemSucesso('Foto de perfil removida. Clique em Salvar Alterações para confirmar.');
    setTimeout(() => setMensagemSucesso(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    setMensagemErro(null);
    setMensagemSucesso(null);
    setSaving(true);

    try {
      // 1. Processa upload da foto no Storage se houver alteração
      let finalAvatarUrl: string | null = profile.avatar_url;

      if (novaFotoFile && avatarPreview) {
        finalAvatarUrl = await uploadFotoPerfilStorage(user.id, avatarPreview);
      } else if (fotoRemovida) {
        if (profile.avatar_url) {
          await removerFotoPerfilStorage(profile.avatar_url);
        }
        finalAvatarUrl = null;
      }

      // 2. Valida payload dos dados cadastrais
      const payload = validarEdicaoMeuPerfil(
        {
          apelido,
          nome,
          quarto_id: quartoId || null,
          geracao: isAdmin ? geracao : profile.geracao || undefined,
          avatar_url: finalAvatarUrl,
        },
        profile
      );

      const dadosParaAtualizar: Record<string, any> = {
        apelido: payload.apelido,
        nome: payload.nome,
        quarto_id: payload.quarto_id,
        avatar_url: finalAvatarUrl,
        updated_at: new Date().toISOString(),
      };

      if (isAdmin && payload.geracao) {
        dadosParaAtualizar.geracao = payload.geracao;
      }

      const { error } = await supabase
        .from('profiles')
        .update(dadosParaAtualizar)
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      setNovaFotoFile(null);
      setFotoRemovida(false);
      await refreshProfile();
      setMensagemSucesso('Perfil e foto atualizados com sucesso!');
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (err: any) {
      console.error('[MeuPerfil] Erro ao salvar perfil:', err);
      setMensagemErro(err.message || 'Erro ao atualizar dados do perfil.');
    } finally {
      setSaving(false);
    }
  };

  const quartoAtualNome =
    rooms.find((r) => r.id === (profile?.quarto_id || quartoId))?.nome ||
    profile?.quarto?.nome ||
    'Sem quarto definido';

  const inicialApelido = (apelido || profile?.apelido || profile?.nome || 'M')
    .charAt(0)
    .toUpperCase();

  return (
    <>
      <PageTitle
        title="Meu Perfil"
        hint="Gerencie sua foto, dados e quarto na Canta Grillo"
        back={{ label: 'Casa', onClick: onBack }}
      />

      {/* Cartão de Resumo do Morador com Foto de Perfil Interativa */}
      <div className="p-4 rounded-xl border border-line bg-surface mb-6 flex items-center gap-4 shadow-2xs">
        {/* Avatar com Botão de Câmera */}
        <div className="relative shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleSelecionarFoto}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 rounded-full overflow-hidden border-2 border-forest/30 bg-mint text-forest flex items-center justify-center font-bold text-xl cursor-pointer hover:border-forest transition-all shadow-xs group relative"
            title="Toque para alterar foto"
          >
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Foto de perfil"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{inicialApelido}</span>
            )}

            {/* Overlay sutil ao passar o dedo/cursor */}
            <div className="absolute inset-0 bg-ink/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera className="w-5 h-5 text-white drop-shadow" />
            </div>
          </div>

          {/* Botão flutuante de câmera */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processandoFoto}
            className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-forest hover:bg-forest-dark text-white shadow-md transition-colors cursor-pointer"
            title="Escolher foto"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Informações do Morador e Ações da Foto */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-ink truncate">
              {apelido || profile?.apelido || profile?.nome || 'Morador'}
            </h3>
            <Tag tone={profile?.role === 'admin' ? 'green' : 'neutral'}>
              {profile?.role === 'admin' ? 'Admin' : 'Morador'}
            </Tag>
          </div>
          <p className="text-xs text-muted truncate mt-0.5">
            {profile?.nome} · {profile?.geracao ? `0${profile.geracao.replace(/^0+/, '')}` : '025'}
          </p>
          <p className="text-xs text-muted/80 flex items-center gap-1 mt-0.5">
            <Home className="w-3 h-3 text-forest" />
            <span>{quartoAtualNome}</span>
          </p>

          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] font-semibold text-forest hover:text-forest-dark transition-colors cursor-pointer"
            >
              {avatarPreview ? 'Trocar foto' : 'Adicionar foto'}
            </button>

            {avatarPreview && (
              <>
                <span className="text-muted/40 text-xs">·</span>
                <button
                  type="button"
                  onClick={handleRemoverFoto}
                  className="text-[11px] font-medium text-clay hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Remover
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {mensagemSucesso && (
        <div className="mb-5 p-3 rounded-xl bg-mint/50 border border-mint text-forest text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {mensagemErro && (
        <div className="mb-5 p-3 rounded-xl bg-clay-tint border border-clay/30 text-clay text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{mensagemErro}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Apelido na República */}
        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
            Apelido na República <span className="text-clay">*</span>
          </label>
          <input
            type="text"
            required
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Ex: Cachorrão, Ganso, Trovão"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium focus:outline-none focus:border-forest transition-colors"
          />
          <p className="text-[11px] text-muted mt-1">
            Destaque principal: toda a interface e rotinas da casa usam estritamente o seu apelido.
          </p>
        </div>

        {/* Nome Completo */}
        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
            Nome Completo <span className="text-clay">*</span>
          </label>
          <input
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Seu nome civil completo"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest transition-colors"
          />
        </div>

        {/* E-mail de Acesso (Somente Leitura) */}
        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
            E-mail de Login
          </label>
          <input
            type="email"
            disabled
            value={profile?.email || user?.email || ''}
            className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-paper text-muted text-sm cursor-not-allowed select-all"
          />
          <p className="text-[11px] text-muted mt-1">
            O e-mail de autenticação é vinculado à sua conta Supabase.
          </p>
        </div>

        {/* Quarto Atual */}
        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
            Quarto Atual na República <span className="text-clay">*</span>
          </label>
          {loadingRooms ? (
            <p className="text-xs text-muted py-2">Carregando quartos...</p>
          ) : (
            <select
              value={quartoId}
              onChange={(e) => setQuartoId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest transition-colors"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} (Capacidade: {r.capacidade})
                </option>
              ))}
            </select>
          )}
          <p className="text-[11px] text-muted mt-1">
            Atualize caso tenha trocado de quarto na rodada de quartos da república.
          </p>
        </div>

        {/* Geração na República */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
              Geração
            </label>
            {isAdmin && (
              <span className="text-[10px] text-forest font-semibold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Editável por Admin
              </span>
            )}
          </div>
          <input
            type="text"
            disabled={!isAdmin}
            value={geracao}
            onChange={(e) => setGeracao(e.target.value)}
            placeholder="Ex: 025"
            className={`w-full px-3.5 py-2.5 rounded-lg border border-line text-sm transition-colors ${
              isAdmin
                ? 'bg-surface text-ink focus:outline-none focus:border-forest'
                : 'bg-paper text-muted cursor-not-allowed'
            }`}
          />
          <p className="text-[11px] text-muted mt-1">
            {isAdmin
              ? 'Você tem permissão de Admin para retificar a geração cadastrada.'
              : 'A geração é definida no ingresso e só pode ser alterada pelo Admin.'}
          </p>
        </div>

        {/* Botão Salvar */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            full
            disabled={saving || processandoFoto}
          >
            {saving ? 'Salvando perfil e foto...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </>
  );
};
