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

export interface DiaSemanaQuadro {
  sigla: 'Seg' | 'Ter' | 'Qua' | 'Qui' | 'Sex' | 'Sáb' | 'Dom';
  nomeCompleto: string;
  data: string; // YYYY-MM-DD
  diaMes: string; // DD/MM
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
  tarefas_semana: TarefaDiariaItem[];
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

/**
 * Retorna os 7 dias da semana ISO (Segunda a Domingo) para uma dada (semana_ano, ano).
 */
export function getDiasDaSemanaIso(semana_ano: number, ano: number): DiaSemanaQuadro[] {
  const NOMES_DIAS: Array<{
    sigla: DiaSemanaQuadro['sigla'];
    nomeCompleto: string;
  }> = [
    { sigla: 'Seg', nomeCompleto: 'Segunda-feira' },
    { sigla: 'Ter', nomeCompleto: 'Terça-feira' },
    { sigla: 'Qua', nomeCompleto: 'Quarta-feira' },
    { sigla: 'Qui', nomeCompleto: 'Quinta-feira' },
    { sigla: 'Sex', nomeCompleto: 'Sexta-feira' },
    { sigla: 'Sáb', nomeCompleto: 'Sábado' },
    { sigla: 'Dom', nomeCompleto: 'Domingo' },
  ];

  // No ISO 8601, o dia 4 de janeiro está sempre na Semana 1 do ano
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1 (Seg) a 7 (Dom)
  const mondayWeek1 = new Date(Date.UTC(ano, 0, 4 - (jan4Day - 1)));
  const mondayTarget = new Date(
    Date.UTC(
      mondayWeek1.getUTCFullYear(),
      mondayWeek1.getUTCMonth(),
      mondayWeek1.getUTCDate() + (semana_ano - 1) * 7
    )
  );

  return NOMES_DIAS.map((item, idx) => {
    const dt = new Date(
      Date.UTC(
        mondayTarget.getUTCFullYear(),
        mondayTarget.getUTCMonth(),
        mondayTarget.getUTCDate() + idx
      )
    );
    const yyyy = String(dt.getUTCFullYear());
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');

    return {
      sigla: item.sigla,
      nomeCompleto: item.nomeCompleto,
      data: `${yyyy}-${mm}-${dd}`,
      diaMes: `${dd}/${mm}`,
    };
  });
}
