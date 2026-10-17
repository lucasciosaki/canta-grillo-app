export interface AtaAutor {
  id: string;
  nome: string;
  apelido: string | null;
}

export interface AtaReuniao {
  id: string;
  data_reuniao: string; // YYYY-MM-DD
  url: string;
  titulo: string | null;
  publicada_por: string | null;
  created_at?: string;
  autor?: AtaAutor | null;
}

export interface NovaAtaInput {
  data_reuniao: string;
  url: string;
  titulo?: string | null;
}

export interface HouseSetting {
  chave: string;
  valor: string;
  descricao?: string | null;
  atualizado_em?: string;
}

/**
 * Valida se uma string é uma URL http/https válida.
 */
export function isValidHttpUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Formata data no padrão brasileiro DD/MM/AAAA sem distorção de timezone.
 */
export function formatarDataAta(dataStr: string): string {
  if (!dataStr) return '';
  // Se contiver T (ISO timestamp), extrai apenas a parte da data
  const dateOnly = dataStr.includes('T') ? dataStr.split('T')[0] : dataStr;
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    const [ano, mes, dia] = parts;
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
  }
  return dataStr;
}

/**
 * Exibição estrita de apelido do autor da ata (Regra da República).
 */
export function obterApelidoAutor(
  autor?: { nome?: string | null; apelido?: string | null } | null
): string {
  if (!autor) return 'Morador';
  if (autor.apelido && autor.apelido.trim()) {
    return autor.apelido.trim();
  }
  if (autor.nome && autor.nome.trim()) {
    return autor.nome.trim().split(' ')[0];
  }
  return 'Morador';
}

/**
 * Ordena atas de reunião pela data da reunião decrescente (e created_at como desempate).
 */
export function ordenarAtas(atas: AtaReuniao[]): AtaReuniao[] {
  return [...atas].sort((a, b) => {
    // 1. data_reuniao DESC
    if (a.data_reuniao !== b.data_reuniao) {
      return b.data_reuniao.localeCompare(a.data_reuniao);
    }
    // 2. created_at DESC (se disponível)
    if (a.created_at && b.created_at) {
      return b.created_at.localeCompare(a.created_at);
    }
    return 0;
  });
}

/**
 * Deriva a "Última Ata" de reunião a partir de uma lista de atas.
 * É sempre a ata com maior data_reuniao.
 */
export function obterUltimaAta(atas: AtaReuniao[]): AtaReuniao | null {
  if (!atas || atas.length === 0) return null;
  const ordenadas = ordenarAtas(atas);
  return ordenadas[0] || null;
}

/**
 * Verifica se o usuário tem permissão para publicar, editar ou excluir atas.
 * RN12: Qualquer morador ativo ou Administrador tem permissão.
 */
export function podeGerenciarAtas(
  role?: string | null,
  ativo?: boolean | null
): boolean {
  if (role === 'admin') return true;
  return role === 'morador' && ativo === true;
}

/**
 * Verifica se o usuário tem permissão para alterar o link do Drive.
 * RN12: Exclusivo para Administrador.
 */
export function podeEditarLinkDrive(
  role?: string | null,
  _ativo?: boolean | null
): boolean {
  if (role === 'admin') return true;
  return false;
}
