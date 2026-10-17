import { supabase } from '../../lib/supabaseClient';
import { gerarNomeArquivoAvatar } from './perfilLogic.ts';

/**
 * Comprime a imagem no cliente recortando centralmente em formato quadrado (512x512)
 * para otimizar velocidade de carregamento e consumo de dados móveis.
 */
export async function comprimirFotoPerfil(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo selecionado.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido ou corrompido.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetDim = 512;
        canvas.width = targetDim;
        canvas.height = targetDim;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Center crop para avatar quadrado
        const minDim = Math.min(img.width, img.height);
        const startX = Math.round((img.width - minDim) / 2);
        const startY = Math.round((img.height - minDim) / 2);

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetDim, targetDim);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Realiza upload da foto comprimida para o bucket público 'avatars' no Supabase Storage.
 * Em caso de indisponibilidade momentânea do bucket, utiliza fallback resiliente para Data URL base64.
 */
export async function uploadFotoPerfilStorage(
  userId: string,
  compressedDataUrl: string
): Promise<string> {
  const fileName = gerarNomeArquivoAvatar(userId);

  try {
    const resBlob = await (await fetch(compressedDataUrl)).blob();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, resBlob, { contentType: 'image/jpeg', upsert: true });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
  } catch (err) {
    console.warn('[AvatarService] Supabase Storage indisponível, usando fallback base64:', err);
  }

  // Fallback resiliente
  return compressedDataUrl;
}

/**
 * Remove o arquivo do avatar antigo do Supabase Storage se for URL remota do bucket.
 */
export async function removerFotoPerfilStorage(avatarUrl: string | null): Promise<void> {
  if (!avatarUrl || !avatarUrl.includes('/avatars/')) return;

  try {
    const partes = avatarUrl.split('/avatars/');
    const fileName = partes[partes.length - 1]?.split('?')[0];
    if (fileName) {
      await supabase.storage.from('avatars').remove([fileName]);
    }
  } catch (err) {
    console.warn('[AvatarService] Falha silenciosa ao remover arquivo antigo do storage:', err);
  }
}
