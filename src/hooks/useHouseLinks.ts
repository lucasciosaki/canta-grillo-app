import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DRIVE_URL as FALLBACK_DRIVE, ULTIMA_ATA_URL as FALLBACK_ATA } from '../config';

interface HouseLinks {
  driveUrl: string | undefined;
  ultimaAtaUrl: string | undefined;
  loading: boolean;
  refetch: () => Promise<void>;
  refreshLinks: () => Promise<void>;
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

  const fetchLinks = useCallback(async () => {
    try {
      // Executa as duas consultas em paralelo
      const [driveRes, ataRes] = await Promise.all([
        supabase
          .from('house_settings')
          .select('valor')
          .eq('chave', 'drive_url')
          .maybeSingle(),
        supabase
          .from('atas_reuniao')
          .select('url, data_reuniao')
          .order('data_reuniao', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (!driveRes.error && driveRes.data?.valor) {
        setDriveUrl(driveRes.data.valor);
      }

      if (!ataRes.error && ataRes.data?.url) {
        setUltimaAtaUrl(ataRes.data.url);
      }
    } catch (err) {
      console.warn('[useHouseLinks] Erro ao carregar links do Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const agendarFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchLinks();
      }, 800);
    };

    // Sincronização em tempo real para house_settings e atas_reuniao
    const channel = supabase
      .channel('house-links-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'house_settings' },
        agendarFetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atas_reuniao' },
        agendarFetch
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchLinks]);

  return { driveUrl, ultimaAtaUrl, loading, refetch: fetchLinks, refreshLinks: fetchLinks };
}
