export interface Quarto {
  id: string;
  nome: string;
  capacidade: number;
}

export interface AreaComum {
  id: string;
  nome: string;
  descricao?: string | null;
}

export interface EscalaSemanalItem {
  id?: string;
  semana_ano: number;
  ano: number;
  quarto_id: string;
  area_comum_id: string;
  pontos_faltas: number;
  penalidade_atribuida?: string | null;
  quarto?: Quarto;
  area_comum?: AreaComum;
}

export type FiscalStatus = 'pendente' | 'aprovado' | 'reprovado' | 'omitido';

export interface TarefaDiariaItem {
  id?: string;
  data: string; // YYYY-MM-DD
  quarto_id: string;
  area_comum_id: string;
  status: 'cumprido' | 'faltou' | 'pendente';
  fotos_comprovacao: string[];
  enviado_em?: string | null;
  enviado_por?: string | null;
  enviado_por_apelido?: string | null;
  fiscal_status: FiscalStatus;
  fiscal_foto_url?: string | null;
  fiscal_observacao?: string | null;
  fiscalizado_em?: string | null;
  fiscalizado_por?: string | null;
  fiscalizado_por_apelido?: string | null;
  quarto?: Quarto;
  area_comum?: AreaComum;
  isFiscal: boolean; // true se for a área do Halls
}

export interface QuadroSemanalConsolidado {
  semana_ano: number;
  ano: number;
  penalidade_semana: string;
  quarto_fiscal_id: string | null;
  quarto_fiscal_nome: string | null;
  itens: EscalaSemanalItem[];
  tarefas_hoje: TarefaDiariaItem[];
  precisa_inicializacao: boolean;
}

/** 6 Funções Oficiais da Canta Grillo na ordem de rodízio */
export const FUNCOES_OFICIAIS = [
  'Sala de TV',
  'Sala de Estudos',
  'Externo',
  'Dispensa',
  'Cozinha',
  'Halls',
] as const;

/**
 * Calcula a próxima atribuição do rodízio linear circular:
 * A cada nova semana, cada quarto passa para a próxima função da lista circular.
 * Índice da função na próxima semana: (indiceAtual + 1) % 6
 */
export function calcularProximaRotacao(
  funcoesAtuaisPorQuarto: { quarto_id: string; area_ordem: number }[]
): { quarto_id: string; proxima_area_ordem: number }[] {
  return funcoesAtuaisPorQuarto.map((item) => ({
    quarto_id: item.quarto_id,
    proxima_area_ordem: (item.area_ordem + 1) % 6,
  }));
}

/**
 * Verifica se o quarto atingiu o limite de faltas da semana (>= 2 faltas)
 */
export function atingiuPenalidadeSemanal(faltas: number): boolean {
  return faltas >= 2;
}

/**
 * Calcula número da semana ISO e ano para uma data
 */
export function getIsoWeekAndYear(d = new Date()): { semana_ano: number; ano: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // No ISO 8601, a semana começa na segunda-feira
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { semana_ano: weekNo, ano: date.getUTCFullYear() };
}
