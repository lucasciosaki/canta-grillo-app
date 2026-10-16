export type StatusFunca = 'aberta' | 'em_andamento' | 'concluida';

export type TipoAtribuicaoFunca =
  | 'autoatribuicao'
  | 'lider_frente'
  | 'veterano_bixo'
  | 'admin_geral'
  | 'reuniao'
  | 'troca';

export interface PerfilResumoFunca {
  id: string;
  nome: string;
  apelido: string | null;
  role?: 'admin' | 'morador' | 'externo';
  ativo?: boolean;
  geracao?: string | null;
}

export interface FuncaAtribuicao {
  funca_id: string;
  morador_id: string;
  atribuido_por: string | null;
  tipo_atribuicao: TipoAtribuicaoFunca;
  atribuido_em: string;
  troca_solicitada_para?: string | null;
  troca_solicitada_em?: string | null;
  morador?: PerfilResumoFunca | null;
  autor_atribuicao?: PerfilResumoFunca | null;
  alvo_troca?: PerfilResumoFunca | null;
}

export interface Funca {
  id: string;
  frente_id: string | null;
  relator_id: string;
  titulo: string;
  descricao: string;
  foto_url: string | null;
  status: StatusFunca;
  prazo: string | null;
  created_at: string;
  frente?: { id: string; nome: string; slug: string } | null;
  relator?: PerfilResumoFunca | null;
  atribuicoes: FuncaAtribuicao[];
}

/**
 * Exibição estrita por apelido com fallback para primeiro nome
 */
export function obterApelidoMorador(
  perfil?: { nome?: string | null; apelido?: string | null } | null
): string {
  if (!perfil) return 'Morador';
  if (perfil.apelido && perfil.apelido.trim()) {
    return perfil.apelido.trim();
  }
  if (perfil.nome && perfil.nome.trim()) {
    return perfil.nome.trim().split(' ')[0];
  }
  return 'Morador';
}

/**
 * Extrai o número inteiro da geração (ex: '024' -> 24, '025' -> 25)
 */
export function parseGeracaoNumero(geracao?: string | null): number | null {
  if (!geracao) return null;
  const limpo = geracao.replace(/\D/g, '');
  if (!limpo) return null;
  const num = parseInt(limpo, 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Verifica se um usuário é veterano de outro (geração menor = mais antigo na casa)
 */
export function isVeteranoDe(
  veterano?: PerfilResumoFunca | null,
  bixo?: PerfilResumoFunca | null
): boolean {
  if (!veterano || !bixo) return false;
  if (veterano.id === bixo.id) return false;
  if (veterano.ativo === false || bixo.ativo === false) return false;
  if (veterano.role === 'externo' || bixo.role === 'externo') return false;

  const numVet = parseGeracaoNumero(veterano.geracao);
  const numBixo = parseGeracaoNumero(bixo.geracao);

  if (numVet === null || numBixo === null) return false;
  return numVet < numBixo;
}

/**
 * Verifica se o usuário é líder de uma frente específica
 */
export function isLiderDaFrente(
  userId: string,
  frenteId: string | null,
  membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>
): boolean {
  if (!frenteId) return false;
  return membrosFrentes.some(
    (m) => m.front_id === frenteId && m.profile_id === userId && m.is_lider
  );
}

/**
 * Verifica se o usuário é membro ou líder de uma frente específica
 */
export function isMembroDaFrente(
  userId: string,
  frenteId: string | null,
  membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>
): boolean {
  if (!frenteId) return false;
  return membrosFrentes.some(
    (m) => m.front_id === frenteId && m.profile_id === userId
  );
}

export interface PermissaoAtribuicaoParams {
  autor: PerfilResumoFunca;
  alvo: PerfilResumoFunca;
  frenteId: string | null;
  membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>;
  modoReuniao?: boolean;
}

export interface PermissaoAtribuicaoResult {
  permitido: boolean;
  tipoAtribuicao: TipoAtribuicaoFunca | null;
  motivo?: string;
}

/**
 * Verifica a permissão de atribuição respeitando rigorosamente a RN09
 */
export function verificarPermissaoAtribuicao({
  autor,
  alvo,
  frenteId,
  membrosFrentes,
  modoReuniao = false,
}: PermissaoAtribuicaoParams): PermissaoAtribuicaoResult {
  if (autor.ativo === false || alvo.ativo === false) {
    return { permitido: false, tipoAtribuicao: null, motivo: 'Usuário inativo' };
  }
  if (autor.role === 'externo' || alvo.role === 'externo') {
    return { permitido: false, tipoAtribuicao: null, motivo: 'Convidados externos não participam de funças' };
  }

  // Na Reunião Semanal, qualquer morador ativo ou admin pode alocar qualquer funça para qualquer morador ativo
  if (modoReuniao) {
    return { permitido: true, tipoAtribuicao: 'reuniao' };
  }

  // Administrador tem permissão global para qualquer funça
  if (autor.role === 'admin') {
    return { permitido: true, tipoAtribuicao: 'admin_geral' };
  }

  // Funça de Frente (frente_id IS NOT NULL)
  if (frenteId !== null) {
    // Autoatribuição: membro da frente se autoatribui
    if (autor.id === alvo.id) {
      if (isMembroDaFrente(autor.id, frenteId, membrosFrentes)) {
        return { permitido: true, tipoAtribuicao: 'autoatribuicao' };
      }
      return {
        permitido: false,
        tipoAtribuicao: null,
        motivo: 'Apenas integrantes desta frente podem se autoatribuir',
      };
    }

    // Líder da Frente atribui para integrante da frente
    if (isLiderDaFrente(autor.id, frenteId, membrosFrentes)) {
      if (isMembroDaFrente(alvo.id, frenteId, membrosFrentes)) {
        return { permitido: true, tipoAtribuicao: 'lider_frente' };
      }
      return {
        permitido: false,
        tipoAtribuicao: null,
        motivo: 'O líder só pode atribuir para moradores que integram esta frente',
      };
    }

    return {
      permitido: false,
      tipoAtribuicao: null,
      motivo: 'Apenas líderes da frente podem atribuir funças a outros integrantes',
    };
  }

  // Funça Geral (frente_id IS NULL)
  // Autoatribuição: qualquer morador ativo pode se autoatribuir
  if (autor.id === alvo.id) {
    return { permitido: true, tipoAtribuicao: 'autoatribuicao' };
  }

  // Veterano atribui para bixo (geração menor atribui para geração maior)
  if (isVeteranoDe(autor, alvo)) {
    return { permitido: true, tipoAtribuicao: 'veterano_bixo' };
  }

  return {
    permitido: false,
    tipoAtribuicao: null,
    motivo: 'Veteranos podem atribuir Funças Gerais apenas para seus bixos',
  };
}

export interface PodeRemoverParams {
  usuario: PerfilResumoFunca;
  atribuicao: { morador_id: string; morador?: PerfilResumoFunca | null };
  frenteId: string | null;
  membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>;
}

/**
 * Define quem pode remover diretamente um responsável de uma funça:
 * - Admin
 * - Líder da Frente (se for funça de frente)
 * - Veterano do morador atribuído (inclusive em Funça de Frente)
 * O próprio responsável comum NÃO pode se desatribuir diretamente (deve pedir troca).
 */
export function podeRemoverResponsavel({
  usuario,
  atribuicao,
  frenteId,
  membrosFrentes,
}: PodeRemoverParams): boolean {
  if (usuario.ativo === false || usuario.role === 'externo') return false;

  // Admin pode remover
  if (usuario.role === 'admin') return true;

  // Líder da frente pode remover responsável da sua frente
  if (frenteId !== null && isLiderDaFrente(usuario.id, frenteId, membrosFrentes)) {
    return true;
  }

  // Veterano do morador atribuído pode removê-lo (inclusive em Funça de Frente)
  if (isVeteranoDe(usuario, atribuicao.morador)) {
    return true;
  }

  return false;
}

export interface PodeSolicitarTrocaParams {
  usuarioId: string;
  atribuicao: { morador_id: string };
  alvo: PerfilResumoFunca;
  atribuicoesAtuaisIds: string[];
}

/**
 * O responsável atual pode solicitar troca para qualquer morador ativo da casa
 * (seja Funça Geral ou de Frente), desde que o alvo ainda não seja responsável na mesma funça.
 */
export function podeSolicitarTroca({
  usuarioId,
  atribuicao,
  alvo,
  atribuicoesAtuaisIds,
}: PodeSolicitarTrocaParams): boolean {
  if (usuarioId !== atribuicao.morador_id) return false;
  if (alvo.id === usuarioId) return false;
  if (alvo.ativo === false || alvo.role === 'externo') return false;
  if (atribuicoesAtuaisIds.includes(alvo.id)) return false;
  return true;
}

export interface PodeAvancarStatusParams {
  usuario: PerfilResumoFunca;
  funca: { relator_id: string; frente_id: string | null };
  atribuicoes: Array<{
    morador_id: string;
    atribuido_por: string | null;
    morador?: PerfilResumoFunca | null;
  }>;
  membrosFrentes: Array<{ front_id: string; profile_id: string; is_lider: boolean }>;
}

/**
 * Quem tem autorização para iniciar ou concluir uma funça:
 * - Responsável atribuído
 * - Líder da frente (se houver)
 * - Veterano que atribuiu ou veterano de algum responsável
 * - Relator da funça
 * - Admin
 */
export function podeAvancarStatusFunca({
  usuario,
  funca,
  atribuicoes,
  membrosFrentes,
}: PodeAvancarStatusParams): boolean {
  if (usuario.ativo === false || usuario.role === 'externo') return false;
  if (usuario.role === 'admin') return true;
  if (funca.relator_id === usuario.id) return true;

  // Responsável atribuído
  if (atribuicoes.some((a) => a.morador_id === usuario.id)) return true;

  // Líder da frente
  if (funca.frente_id && isLiderDaFrente(usuario.id, funca.frente_id, membrosFrentes)) {
    return true;
  }

  // Quem atribuiu diretamente
  if (atribuicoes.some((a) => a.atribuido_por === usuario.id)) return true;

  // Veterano de algum responsável
  if (atribuicoes.some((a) => isVeteranoDe(usuario, a.morador))) return true;

  return false;
}

/**
 * Transição manual em 3 etapas
 */
export function obterProximoStatusManual(statusAtual: StatusFunca): StatusFunca | null {
  if (statusAtual === 'aberta') return 'em_andamento';
  if (statusAtual === 'em_andamento') return 'concluida';
  return null;
}
