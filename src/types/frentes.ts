import type { Profile } from './auth';

export interface Front {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  created_at?: string;
}

export interface FrontMember {
  front_id: string;
  profile_id: string;
  is_lider: boolean;
  data_inicio: string;
  profile?: Profile;
}

export interface FrontWithMembers extends Front {
  membros: FrontMember[];
}

export type FrenteDetalheTab = 'painel' | 'especifica' | 'chat' | 'membros';

export interface MensagemFrente {
  id: string;
  frente_id: string;
  autor_id: string;
  conteudo: string;
  enviada_em: string;
  autor?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null;
}

export type StatusFunca = 'aberta' | 'em_andamento' | 'concluida';
export type TipoAtribuicaoFunca = 'autoatribuicao' | 'lider_frente' | 'veterano_bixo' | 'admin_geral' | 'reuniao';

export interface FuncaAtribuicao {
  funca_id: string;
  morador_id: string;
  atribuido_por: string | null;
  tipo_atribuicao: TipoAtribuicaoFunca;
  atribuido_em: string;
  morador?: Pick<Profile, 'id' | 'nome' | 'apelido' | 'geracao'> | null;
}

export interface FuncaFrente {
  id: string;
  frente_id: string | null;
  relator_id: string;
  titulo: string;
  descricao: string;
  foto_url: string | null;
  status: StatusFunca;
  prazo: string | null;
  created_at: string;
  relator?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null;
  atribuicoes?: FuncaAtribuicao[];
}

export type TurnoDogs = 'manha' | 'noite';

export interface DogsRefeicaoDiaria {
  id: string;
  data: string; // YYYY-MM-DD
  turno: TurnoDogs;
  alimentado_por: string;
  horario_alimentacao: string;
  observacoes: string | null;
  morador?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null;
}

export type CategoriaMercado = 'Alimentos' | 'Limpeza' | 'Higiene' | 'Descartáveis' | 'Outros';

export interface MarketCatalogItem {
  id: string;
  nome: string;
  categoria: string;
  unidade_medida: string;
  is_ativo: boolean;
  created_at?: string;
}

export interface SolicitacaoMercado {
  item_id: string;
  mes_ano_ciclo: string; // YYYY-MM
  solicitado_por: string;
  status: 'solicitado' | 'comprado';
  data_solicitacao: string;
  item?: MarketCatalogItem;
  solicitante?: Pick<Profile, 'id' | 'nome' | 'apelido'> | null;
}

export interface ItemCompraAgrupado {
  item: MarketCatalogItem;
  solicitantesApelidos: string[];
  todosComprados: boolean;
  solicitacoes: SolicitacaoMercado[];
}

export interface ResumoConvidadoFinanceiro {
  convidado_id: string;
  apelido: string;
  telefone_contato: string | null;
  total_refeicoes: number;
  datas_consumo: string[];
}

/**
 * Retorna estritamente o apelido do morador/convidado, com fallback para o nome ou 'Morador'.
 */
export function obterApelidoFrente(
  perfil?: { nome?: string | null; apelido?: string | null } | null
): string {
  if (!perfil) return 'Morador';
  const apelido = perfil.apelido?.trim();
  if (apelido) return apelido;
  const nome = perfil.nome?.trim();
  if (nome) return nome;
  return 'Morador';
}

/**
 * Filtra a lista de frentes visíveis para o usuário:
 * - Admin vê todas as 10 frentes.
 * - Morador comum vê apenas as frentes em que participa (front_members).
 */
export function filtrarFrentesVisiveis(
  frentes: Front[],
  membros: FrontMember[],
  userId?: string | null,
  isAdmin?: boolean
): Front[] {
  if (isAdmin) return frentes;
  if (!userId) return [];
  const minhasFrentesIds = new Set(
    membros.filter((m) => m.profile_id === userId).map((m) => m.front_id)
  );
  return frentes.filter((f) => minhasFrentesIds.has(f.id));
}

/**
 * Verifica as permissões de acesso, participação e liderança de um morador em uma frente.
 */
export function verificarPermissaoFrente(
  frenteId: string,
  membros: FrontMember[],
  userId?: string | null,
  isAdmin?: boolean
): { podeAcessar: boolean; isMembro: boolean; isLider: boolean } {
  if (!userId) {
    return { podeAcessar: Boolean(isAdmin), isMembro: false, isLider: false };
  }
  const membro = membros.find(
    (m) => m.front_id === frenteId && m.profile_id === userId
  );
  const isMembro = Boolean(membro);
  const isLider = Boolean(membro?.is_lider);
  const podeAcessar = Boolean(isAdmin || isMembro);

  return { podeAcessar, isMembro, isLider };
}

/**
 * Filtra apenas as funças pendentes da frente (aberta ou em_andamento),
 * ordenando 'em_andamento' no topo, e em seguida por prazo mais próximo.
 */
export function filtrarFuncasPendentesDaFrente(
  funcas: FuncaFrente[],
  frenteId: string
): FuncaFrente[] {
  return funcas
    .filter(
      (f) =>
        f.frente_id === frenteId &&
        (f.status === 'aberta' || f.status === 'em_andamento')
    )
    .sort((a, b) => {
      // Prioridade 1: 'em_andamento' antes de 'aberta'
      if (a.status === 'em_andamento' && b.status !== 'em_andamento') return -1;
      if (b.status === 'em_andamento' && a.status !== 'em_andamento') return 1;

      // Prioridade 2: prazo definido
      if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
      if (a.prazo && !b.prazo) return -1;
      if (!a.prazo && b.prazo) return 1;

      // Prioridade 3: mais recentes criadas
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

/**
 * Valida se um usuário pode atribuir uma funça da frente a determinado morador.
 */
export function podeAtribuirFuncaNaFrente(params: {
  isAdmin: boolean;
  isLiderDaFrente: boolean;
  isMembroDaFrente: boolean;
  autorId: string;
  alvoMoradorId: string;
}): { permitido: boolean; tipoAtribuicao: TipoAtribuicaoFunca | null } {
  const { isAdmin, isLiderDaFrente, isMembroDaFrente, autorId, alvoMoradorId } = params;

  // Autoatribuição: morador da frente ou admin puxa para si mesmo
  if (autorId === alvoMoradorId && (isMembroDaFrente || isAdmin)) {
    return { permitido: true, tipoAtribuicao: 'autoatribuicao' };
  }

  // Líder da frente atribui a membro
  if (isLiderDaFrente) {
    return { permitido: true, tipoAtribuicao: 'lider_frente' };
  }

  // Admin da república atribui a qualquer um
  if (isAdmin) {
    return { permitido: true, tipoAtribuicao: 'admin_geral' };
  }

  return { permitido: false, tipoAtribuicao: null };
}

/**
 * Processa os registros de refeição dos cães no dia e retorna status de Manhã e Noite.
 */
export function obterStatusChecklistDogsDia(registrosDia: DogsRefeicaoDiaria[]): {
  manha: DogsRefeicaoDiaria | null;
  noite: DogsRefeicaoDiaria | null;
  completo: boolean;
} {
  const manha = registrosDia.find((r) => r.turno === 'manha') || null;
  const noite = registrosDia.find((r) => r.turno === 'noite') || null;
  return {
    manha,
    noite,
    completo: Boolean(manha && noite),
  };
}

/**
 * Agrupa as solicitações de mercado do ciclo mensal por item do catálogo.
 */
export function agruparSolicitacoesMercadoPorItem(
  solicitacoes: SolicitacaoMercado[],
  catalogo: MarketCatalogItem[]
): ItemCompraAgrupado[] {
  const catalogoMap = new Map<string, MarketCatalogItem>();
  catalogo.forEach((item) => catalogoMap.set(item.id, item));

  const mapaGrupos = new Map<
    string,
    { item: MarketCatalogItem; solicitacoes: SolicitacaoMercado[] }
  >();

  for (const sol of solicitacoes) {
    const item = sol.item || catalogoMap.get(sol.item_id);
    if (!item) continue;

    if (!mapaGrupos.has(item.id)) {
      mapaGrupos.set(item.id, { item, solicitacoes: [] });
    }
    mapaGrupos.get(item.id)!.solicitacoes.push(sol);
  }

  const agrupados: ItemCompraAgrupado[] = [];

  for (const [, grupo] of mapaGrupos) {
    const nomes = new Set<string>();
    grupo.solicitacoes.forEach((s) => {
      nomes.add(obterApelidoFrente(s.solicitante));
    });

    const todosComprados =
      grupo.solicitacoes.length > 0 &&
      grupo.solicitacoes.every((s) => s.status === 'comprado');

    agrupados.push({
      item: grupo.item,
      solicitantesApelidos: Array.from(nomes),
      todosComprados,
      solicitacoes: grupo.solicitacoes,
    });
  }

  // Ordena itens não comprados primeiro, depois por nome do item
  return agrupados.sort((a, b) => {
    if (!a.todosComprados && b.todosComprados) return -1;
    if (a.todosComprados && !b.todosComprados) return 1;
    return a.item.nome.localeCompare(b.item.nome, 'pt-BR');
  });
}

/**
 * Calcula o relatório consolidado de refeições de convidados externos no mês selecionado.
 */
export function calcularRelatorioExternosMes(
  perfisExternos: Pick<Profile, 'id' | 'nome' | 'apelido' | 'telefone_contato' | 'role'>[],
  refeicoes: { usuario_id: string; data: string; misturas_consumidas: number }[],
  mesAnoCiclo: string
): ResumoConvidadoFinanceiro[] {
  const externosMap = new Map<
    string,
    Pick<Profile, 'id' | 'nome' | 'apelido' | 'telefone_contato' | 'role'>
  >();

  perfisExternos
    .filter((p) => p.role === 'externo')
    .forEach((p) => externosMap.set(p.id, p));

  const contagemMap = new Map<string, { total: number; datas: Set<string> }>();

  for (const ref of refeicoes) {
    if (!ref.data.startsWith(mesAnoCiclo)) continue;
    if (Number(ref.misturas_consumidas) <= 0) continue;
    if (!externosMap.has(ref.usuario_id)) continue;

    if (!contagemMap.has(ref.usuario_id)) {
      contagemMap.set(ref.usuario_id, { total: 0, datas: new Set() });
    }
    const info = contagemMap.get(ref.usuario_id)!;
    info.total += 1;
    info.datas.add(ref.data);
  }

  const resultado: ResumoConvidadoFinanceiro[] = [];

  for (const [convidadoId, perfil] of externosMap) {
    const dados = contagemMap.get(convidadoId);
    if (!dados || dados.total === 0) continue;

    resultado.push({
      convidado_id: convidadoId,
      apelido: obterApelidoFrente(perfil),
      telefone_contato: perfil.telefone_contato || null,
      total_refeicoes: dados.total,
      datas_consumo: Array.from(dados.datas).sort(),
    });
  }

  // Ordena pelo maior número de refeições consumidas no mês
  return resultado.sort((a, b) => b.total_refeicoes - a.total_refeicoes);
}

/**
 * Retorna o ciclo no formato 'YYYY-MM' baseado no horário local.
 */
export function obterMesAnoAtual(date: Date = new Date()): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}
