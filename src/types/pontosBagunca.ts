export interface PontoBagunca {
  id: string;
  relator_id: string;
  culpado_id: string | null;
  foto_url: string;
  local_descricao: string;
  status: 'aberta' | 'assumida' | 'reuniao';
  created_at: string;
  assumida_em?: string | null;
  relator?: {
    id: string;
    nome: string;
    apelido: string | null;
  } | null;
  culpado?: {
    id: string;
    nome: string;
    apelido: string | null;
  } | null;
  culpados?: CulpadoPontoBagunca[];
  acusacoes?: AcusacaoPontoBagunca[];
}

export interface MensagemPontoBagunca {
  id: string;
  ponto_bagunca_id: string;
  autor_id: string;
  conteudo: string;
  enviada_em: string;
  autor?: {
    id: string;
    nome: string;
    apelido: string | null;
  } | null;
}

export interface VisualizacaoPonto {
  ponto_id: string;
  morador_id: string;
  visualizado_em: string;
  declarou_inocente?: boolean;
  inocente_em?: string | null;
}

export interface AcusacaoPontoBagunca {
  id: string;
  ponto_id: string;
  acusado_id: string;
  acusador_id: string;
  status: 'pendente' | 'inocente' | 'assumido';
  created_at: string;
  respondido_em?: string | null;
  acusado?: {
    id: string;
    nome: string;
    apelido: string | null;
    avatar_url?: string | null;
  } | null;
  acusador?: {
    id: string;
    nome: string;
    apelido: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface CulpadoPontoBagunca {
  id: string;
  ponto_id: string;
  morador_id: string;
  assumido_em: string;
  morador?: {
    id: string;
    nome: string;
    apelido: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface Prazo24hInfo {
  horasRestantes: number;
  minutosRestantes: number;
  expirado: boolean;
  label: string;
  porcentagemDecorrida: number; // 0 a 100
}

/**
 * Calcula o tempo restante para o prazo limite de 24 horas a partir da data de criação do ponto.
 */
export function calcularPrazo24h(createdAtIso: string, agora = new Date()): Prazo24hInfo {
  const criacao = new Date(createdAtIso).getTime();
  const limite = criacao + 24 * 60 * 60 * 1000;
  const diferencaMs = limite - agora.getTime();

  const tempoTotalMs = 24 * 60 * 60 * 1000;
  const tempoDecorridoMs = agora.getTime() - criacao;
  const porcentagemDecorrida = Math.min(
    100,
    Math.max(0, Math.round((tempoDecorridoMs / tempoTotalMs) * 100))
  );

  if (diferencaMs <= 0) {
    const horasExpiradas = Math.floor(Math.abs(diferencaMs) / (60 * 60 * 1000));
    return {
      horasRestantes: 0,
      minutosRestantes: 0,
      expirado: true,
      label: horasExpiradas <= 0 ? 'Expirou há poucos minutos' : `Prazo de 24h expirado (${horasExpiradas}h atrás)`,
      porcentagemDecorrida: 100,
    };
  }

  const horas = Math.floor(diferencaMs / (60 * 60 * 1000));
  const minutos = Math.floor((diferencaMs % (60 * 60 * 1000)) / (60 * 1000));

  let label = '';
  if (horas > 0) {
    label = `Resta ${horas}h para abrir`;
  } else {
    label = `Resta ${minutos} min para abrir`;
  }

  return {
    horasRestantes: horas,
    minutosRestantes: minutos,
    expirado: false,
    label,
    porcentagemDecorrida,
  };
}
