// Supabase Edge Function: send-push
// Dispara notificações Web Push criptografadas (RFC 8291 aes128gcm + RFC 8292 VAPID ES256)
// Zero dependências externas de C++/Node: usa Web Crypto API nativa (crypto.subtle) do Deno.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface PushPayload {
  user_ids?: string[];
  broadcast_except_user_id?: string;
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
}

const DEFAULT_VAPID_PUBLIC_KEY =
  'BM3zVhLUeAUW0fhv1mk_qT7GV9BdvLMHyOSgkdVxW0Ttpadg0bxCuhVMP1spI87twk3blNlQeUPpkwvInGFrLLI';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function b64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const res = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    res.set(a, offset);
    offset += a.length;
  }
  return res;
}

async function hmacSha256(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const infoWithCounter = concatBytes(info, new Uint8Array([1]));
  const okm = await hmacSha256(prk, infoWithCounter);
  return okm.slice(0, length);
}

/**
 * Gera cabeçalho Authorization VAPID (RFC 8292 ES256) para o endpoint de destino.
 */
async function createVapidAuthorization(
  endpoint: string,
  vapidPublicKeyB64: string,
  vapidPrivateKeyB64: string,
  subject = 'mailto:rep@cantagrillo.com'
): Promise<string> {
  const urlObj = new URL(endpoint);
  const audience = `${urlObj.protocol}//${urlObj.host}`;

  const pubBytes = b64urlDecode(vapidPublicKeyB64);
  const x = b64urlEncode(pubBytes.slice(1, 33));
  const y = b64urlEncode(pubBytes.slice(33, 65));

  const signKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: vapidPrivateKeyB64,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const enc = new TextEncoder();
  const headerB64 = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payloadB64 = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp, sub: subject })));

  const unsignedToken = enc.encode(`${headerB64}.${payloadB64}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, unsignedToken)
  );
  const jwt = `${headerB64}.${payloadB64}.${b64urlEncode(signature)}`;

  return `vapid t=${jwt}, k=${vapidPublicKeyB64}`;
}

/**
 * Criptografa o payload JSON usando o padrão Web Push aes128gcm (RFC 8291).
 */
async function encryptWebPushAes128Gcm(
  plaintextStr: string,
  clientP256dhB64: string,
  clientAuthB64: string
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(clientP256dhB64);
  const authSecret = b64urlDecode(clientAuthB64);

  const clientPubKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPubKey },
      asKeyPair.privateKey,
      256
    )
  );

  const enc = new TextEncoder();
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const paddedPlaintext = concatBytes(enc.encode(plaintextStr), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlaintext)
  );

  // Header binário aes128gcm: salt (16B) + rs (4B = 4096) + idlen (1B = 65) + keyid (65B)
  const rsBytes = new Uint8Array([0x00, 0x00, 0x10, 0x00]);
  const idLen = new Uint8Array([asPublic.length]);
  return concatBytes(salt, rsBytes, idLen, asPublic, ciphertext);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada.');
    }

    if (!vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          error: 'Secret VAPID_PRIVATE_KEY não configurada nas Edge Functions do Supabase.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: PushPayload = await req.json();

    const {
      user_ids,
      broadcast_except_user_id,
      title,
      body: msgBody,
      tag = 'canta-grillo',
      url = '/',
      icon = '/logo.png',
    } = body;

    // 1. Busca aparelhos inscritos (por lista de user_ids ou broadcast exceto autor)
    let query = supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth');

    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    } else if (broadcast_except_user_id) {
      query = query.neq('user_id', broadcast_except_user_id);
    } else {
      return new Response(
        JSON.stringify({ error: 'Informe user_ids ou broadcast_except_user_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: subscriptions, error: subError } = await query;

    if (subError || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Nenhuma inscrição push encontrada para os destinatários.',
          sent: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pushPayloadStr = JSON.stringify({
      title,
      body: msgBody,
      tag,
      url,
      icon,
    });

    // 2. Criptografa (aes128gcm) e dispara o Web Push assinado com VAPID para cada aparelho
    const expiredSubIds: string[] = [];
    let sentCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const encryptedBody = await encryptWebPushAes128Gcm(
            pushPayloadStr,
            sub.p256dh,
            sub.auth
          );
          const authorization = await createVapidAuthorization(
            sub.endpoint,
            vapidPublicKey,
            vapidPrivateKey
          );

          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'aes128gcm',
              'Content-Length': String(encryptedBody.byteLength),
              TTL: '86400',
              Urgency: 'high',
              Authorization: authorization,
            },
            body: encryptedBody,
          });

          if (response.status === 404 || response.status === 410 || response.status === 403) {
            expiredSubIds.push(sub.id);
          } else if (response.ok || response.status === 201) {
            sentCount++;
          } else {
            const errText = await response.text().catch(() => '');
            console.warn(
              `[send-push] Gateway retornou ${response.status} para sub ${sub.id}:`,
              errText
            );
          }
        } catch (pushErr) {
          console.warn(`[send-push] Falha ao enviar para sub ${sub.id}:`, pushErr);
        }
      })
    );

    // 3. Remove inscrições expiradas ou com chave antiga (403/404/410)
    if (expiredSubIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredSubIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        aparelhosEncontrados: subscriptions.length,
        disparadosComSucesso: sentCount,
        expiradosRemovidos: expiredSubIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[send-push] Erro interno:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno na Edge Function' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
