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

export interface RegraPontoItem {
  pontos: number; // 2 a 7
  descricao: string;
}

export interface QuadroSemanalConsolidado {
  semana_ano: number;
  ano: number;
  penalidade_semana: string;
  regras_pontos?: RegraPontoItem[];
  quarto_fiscal_id: string | null;
  quarto_fiscal_nome: string | null;
  itens: EscalaSemanalItem[];
  tarefas_hoje: TarefaDiariaItem[];
  precisa_inicializacao: boolean;
}

/** Regras Padrão de 2 a 7 Pontos do Quadro de Faxina da Canta Grillo */
export const REGRAS_PONTOS_PADRAO: RegraPontoItem[] = [
  { pontos: 2, descricao: 'Pagar 1 caixa de cerveja para a casa' },
  { pontos: 3, descricao: 'Pagar 2 caixas de cerveja para a casa' },
  { pontos: 4, descricao: 'Lavar a cozinha no domingo + 2 caixas' },
  { pontos: 5, descricao: 'Faxina geral da área externa + 3 caixas' },
  { pontos: 6, descricao: 'Faxina pesada da república inteira' },
  { pontos: 7, descricao: 'Pena máxima: Churrasco por conta do quarto' },
];

/**
 * Obtém a penalidade aplicável conforme os pontos acumulados (2 a 7).
 * Se faltas < 2, retorna null.
 * Se faltas >= 2, busca a regra exata correspondente ou a maior regra disponível.
 */
export function obterRegraPorPontos(
  faltas: number,
  regras: RegraPontoItem[] = REGRAS_PONTOS_PADRAO
): RegraPontoItem | null {
  if (faltas < 2) return null;
  const lista = (regras && regras.length > 0) ? regras : REGRAS_PONTOS_PADRAO;
  const pontosClamped = Math.min(faltas, 7);
  const regraExata = lista.find((r) => r.pontos === pontosClamped);
  if (regraExata) return regraExata;
  const aplicaveis = lista.filter((r) => r.pontos <= faltas).sort((a, b) => b.pontos - a.pontos);
  return aplicaveis[0] || null;
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
