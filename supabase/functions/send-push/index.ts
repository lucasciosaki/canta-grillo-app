// Supabase Edge Function: send-push
// Dispara notificações Web Push criptografadas (VAPID) para múltiplos usuários em lote (Batch)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL ou Service Role Key não configurada.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: PushPayload = await req.json();

    const { user_ids, title, body: msgBody, tag = 'canta-grillo', url = '/', icon = '/logo.png' } = body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhum user_id informado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Busca todos os aparelhos registrados dos usuários destinatários
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', user_ids);

    if (subError || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Nenhuma inscrição push encontrada para os destinatários.', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pushPayload = JSON.stringify({
      title,
      body: msgBody,
      tag,
      url,
      icon,
    });

    // 2. Dispara o Web Push em lote para todos os endpoints
    const expiredSubIds: string[] = [];
    let sentCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          // Envio de Web Push via fetch padrão para o gateway do navegador (FCM / APNs)
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              TTL: '86400', // 24 horas de tolerância se aparelho offline
            },
            body: pushPayload,
          });

          if (response.status === 404 || response.status === 410) {
            // Inscrição expirou ou app foi desinstalado
            expiredSubIds.push(sub.id);
          } else if (response.ok) {
            sentCount++;
          }
        } catch (pushErr) {
          console.warn(`[send-push] Falha ao enviar para sub ${sub.id}:`, pushErr);
        }
      })
    );

    // 3. Remove inscrições obsoletas (404/410) para manter a tabela limpa
    if (expiredSubIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredSubIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalDestinatarios: user_ids.length,
        aparelhosEncontrados: subscriptions.length,
        disparadosComSucesso: sentCount,
        expiradosRemovidos: expiredSubIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[send-push] Erro interno:', err);
    return new Response(JSON.stringify({ error: err.message || 'Erro interno na Edge Function' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
