import { supabase } from '../lib/supabaseClient';

export interface CompressImageOptions {
  maxDim?: number;
  quality?: number;
  preferredType?: 'image/webp' | 'image/jpeg';
}

/**
 * Comprime uma imagem no cliente usando HTML5 Canvas para WebP (ou JPEG caso não suportado),
 * reduzindo fotos de câmeras de smartphones de 4MB-8MB para ~40KB-80KB.
 */
export async function compressImageToBlob(
  file: File,
  options: CompressImageOptions = {}
): Promise<{ blob: Blob; contentType: string; ext: string }> {
  const maxDim = options.maxDim || 800;
  const quality = options.quality !== undefined ? options.quality : 0.72;
  const preferredType = options.preferredType || 'image/webp';

  return new Promise((resolve, reject) => {
    let objectUrl: string | null = null;
    const img = new Image();

    const cleanup = () => {
      if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignora erro ao revogar
        }
        objectUrl = null;
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Arquivo de imagem inválido ou corrompido.'));
    };

    img.onload = () => {
      cleanup();
      let { width, height } = img;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback para blob do próprio arquivo original se canvas context falhar
        resolve({
          blob: file,
          contentType: file.type || 'image/jpeg',
          ext: file.type.includes('png') ? 'png' : 'jpg',
        });
        return;
      }

      // Desenha a imagem redimensionada
      ctx.drawImage(img, 0, 0, width, height);

      // Tenta exportar em WebP; se o browser não suportar, faz fallback para JPEG
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            const isWebp = blob.type === 'image/webp';
            resolve({
              blob,
              contentType: isWebp ? 'image/webp' : 'image/jpeg',
              ext: isWebp ? 'webp' : 'jpg',
            });
          } else {
            canvas.toBlob(
              (fallbackBlob) => {
                if (fallbackBlob) {
                  resolve({
                    blob: fallbackBlob,
                    contentType: 'image/jpeg',
                    ext: 'jpg',
                  });
                } else {
                  reject(new Error('Falha ao processar e comprimir a imagem.'));
                }
              },
              'image/jpeg',
              quality
            );
          }
        },
        preferredType,
        quality
      );
    };

    // Prioriza URL.createObjectURL para evitar gerar strings base64 gigantes na RAM e no Network log
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        return;
      } catch {
        // Fallback para FileReader se createObjectURL não puder ser chamado
      }
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem selecionado.'));
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface UploadImageParams {
  bucket: 'avatars' | 'pontos_bagunca' | 'funcas' | 'faxina';
  userId: string;
  prefix?: string;
  file: File;
  maxDim?: number;
  quality?: number;
}

/**
 * Comprime a imagem e realiza upload binário direto para o bucket do Supabase Storage.
 * Garante que nenhuma string Base64 seja salva no banco de dados, protegendo o limite de Egress.
 */
export async function uploadImageToBucket({
  bucket,
  userId,
  prefix = 'img',
  file,
  maxDim = 800,
  quality = 0.72,
}: UploadImageParams): Promise<string> {
  const { blob, contentType, ext } = await compressImageToBlob(file, { maxDim, quality });
  const fileName = `${prefix}_${userId}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, blob, {
      contentType,
      cacheControl: '604800', // 7 dias de cache HTTP no navegador
      upsert: true,
    });

  if (uploadError) {
    console.error(`[imageStorage] Erro no upload para o bucket '${bucket}':`, uploadError);
    throw new Error(
      `Não foi possível salvar a imagem no servidor (${uploadError.message || 'Erro no Storage'}). Verifique sua conexão.`
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  if (!publicUrlData?.publicUrl) {
    throw new Error('Não foi possível obter o endereço público da imagem salva.');
  }

  return publicUrlData.publicUrl;
}
