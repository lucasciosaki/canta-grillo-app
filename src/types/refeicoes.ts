import type { Profile } from './auth';

export type MarcaMistura = '—' | '1/2' | 'X';

export interface DailyMeal {
  id: string;
  usuario_id: string;
  data: string; // formato YYYY-MM-DD
  misturas_consumidas: number; // 0.0, 0.5, 1.0
  atualizado_em?: string;
  usuario?: Profile;
}

export interface ConvidadoRefeicao {
  id: string;
  apelido: string;
  telefone_contato: string | null;
  comeu: boolean;
}

export interface ResumoMisturas {
  totalMisturas: number;
  totalPessoas: number;
  totalVazio: number; // 0.0
  totalMeia: number;  // 0.5 (1 mistura)
  totalCheia: number; // 1.0 (2 misturas)
  totalConvidados?: number;
}

/** Converte o símbolo visual da folha de misturas para o valor numérico gravado no Supabase */
export function marcaToNumeric(marca: MarcaMistura): number {
  switch (marca) {
    case '1/2':
      return 0.5;
    case 'X':
      return 1.0;
    case '—':
    default:
      return 0.0;
  }
}

/** Converte o valor numérico gravado no Supabase para o símbolo tradicional da folha de papel */
export function numericToMarca(num: number | null | undefined): MarcaMistura {
  if (num === null || num === undefined) return '—';
  const val = Number(num);
  if (val >= 0.9) return 'X';
  if (val >= 0.4) return '1/2';
  return '—';
}

/** Retorna a data no formato YYYY-MM-DD considerando o fuso horário local */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formata data para exibição elegante em português (ex: "Quinta-feira, 15 de Outubro") */
export function formatarDataExtenso(dateString: string): string {
  // Parsing seguro de YYYY-MM-DD para evitar off-by-one de UTC
  const [year, month, day] = dateString.split('-').map(Number);
  const data = new Date(year, month - 1, day);

  const hoje = getLocalDateString(new Date());
  const ontemDate = new Date();
  ontemDate.setDate(ontemDate.getDate() - 1);
  const ontem = getLocalDateString(ontemDate);

  const amanhaDate = new Date();
  amanhaDate.setDate(amanhaDate.getDate() + 1);
  const amanha = getLocalDateString(amanhaDate);

  let prefixo = '';
  if (dateString === hoje) prefixo = 'Hoje, ';
  else if (dateString === ontem) prefixo = 'Ontem, ';
  else if (dateString === amanha) prefixo = 'Amanhã, ';

  const formatador = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const formatado = formatador.format(data);
  // Deixa a primeira letra maiúscula (ex: Quinta-feira, 15 de outubro)
  const capitalizado = formatado.charAt(0).toUpperCase() + formatado.slice(1);
  return `${prefixo}${capitalizado}`;
}

/** Calcula estatísticas consolidadas da folha de misturas do dia */
export function calcularResumoMisturas(
  moradores: Profile[],
  mealsMap: Record<string, number>,
  totalConvidados: number = 0
): ResumoMisturas {
  let totalMisturas = 0;
  let totalVazio = 0;
  let totalMeia = 0;
  let totalCheia = 0;

  for (const morador of moradores) {
    const valor = mealsMap[morador.id] ?? 0.0;
    totalMisturas += valor;
    if (valor >= 0.9) {
      totalCheia += 1;
    } else if (valor >= 0.4) {
      totalMeia += 1;
    } else {
      totalVazio += 1;
    }
  }

  return {
    totalMisturas: totalMisturas + totalConvidados,
    totalPessoas: totalMeia + totalCheia + totalConvidados,
    totalVazio,
    totalMeia,
    totalCheia,
    totalConvidados,
  };
}

/**
 * Retorna true se a data em formato YYYY-MM-DD for Sábado (6) ou Domingo (0).
 * Faz o parse seguro dos componentes de data evitando distorções de fuso horário.
 */
export function isWeekendDateString(dateStr: string): boolean {
  if (!dateStr) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return false;
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Avança (+1) ou retrocede (-1) a partir de dateStr em busca do dia útil mais próximo,
 * pulando automaticamente sábados e domingos. Se maxDateStr for informado e o próximo
 * dia útil ultrapassar esse teto, retorna a própria dateStr original.
 */
export function getAdjacentWeekday(
  dateStr: string,
  direction: -1 | 1,
  maxDateStr?: string
): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const curr = new Date(year, month - 1, day);

  do {
    curr.setDate(curr.getDate() + direction);
  } while (isWeekendDateString(getLocalDateString(curr)));

  const candidate = getLocalDateString(curr);
  if (maxDateStr && candidate > maxDateStr) {
    return dateStr;
  }
  return candidate;
}

/**
 * Retorna a data inicial para exibição na Folha de Misturas.
 * Se hoje for fim de semana, mantém hojeStr para exibir o banner informativo de fim de semana.
 */
export function getInitialMisturasDate(hojeStr: string): string {
  return hojeStr;
}

