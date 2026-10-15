import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DRIVE_URL as FALLBACK_DRIVE, ULTIMA_ATA_URL as FALLBACK_ATA } from '../config';

interface HouseLinks {
  driveUrl: string | undefined;
  ultimaAtaUrl: string | undefined;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook para carregar links sensíveis da República protegidos no Supabase.
 * - Drive da República: public.house_settings (chave = 'drive_url')
 * - Última Ata de Reunião: public.atas_reuniao (maior data_reuniao)
 */
export function useHouseLinks(): HouseLinks {
  const [driveUrl, setDriveUrl] = useState<string | undefined>(FALLBACK_DRIVE);
  const [ultimaAtaUrl, setUltimaAtaUrl] = useState<string | undefined>(FALLBACK_ATA);
  const [loading, setLoading] = useState(true);

  const fetchLinks = async () => {
    try {
      // 1. Busca o link do Drive na tabela house_settings
      const { data: driveData, error: driveError } = await supabase
        .from('house_settings')
        .select('valor')
        .eq('chave', 'drive_url')
        .maybeSingle();

      if (!driveError && driveData?.valor) {
        setDriveUrl(driveData.valor);
      }

      // 2. Busca a última ata na tabela atas_reuniao (ordenada pela data decrescente)
      const { data: ataData, error: ataError } = await supabase
        .from('atas_reuniao')
        .select('url, data_reuniao')
        .order('data_reuniao', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ataError && ataData?.url) {
        setUltimaAtaUrl(ataData.url);
      }
    } catch (err) {
      console.warn('[useHouseLinks] Erro ao carregar links do Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  return { driveUrl, ultimaAtaUrl, loading, refetch: fetchLinks };
}
