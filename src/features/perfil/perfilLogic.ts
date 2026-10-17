import type { Profile, UserRole } from '../../types/auth';

export interface EdicaoMeuPerfilInput {
  apelido: string;
  nome: string;
  quarto_id: string | null;
  geracao?: string;
  avatar_url?: string | null;
}

export interface EdicaoMeuPerfilResult {
  apelido: string;
  nome: string;
  quarto_id: string | null;
  geracao?: string;
  avatar_url?: string | null;
}

/**
 * Valida o arquivo selecionado para foto de perfil antes de processar/comprimir.
 */
export function validarFotoPerfil(file: { size: number; type: string }): boolean {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado deve ser uma imagem válida (JPG, PNG, WebP).');
  }

  // Limite razoável de 5MB para foto bruta da câmera do celular
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('A foto de perfil deve ter no máximo 5MB.');
  }

  return true;
}

/**
 * Gera nome padronizado para o arquivo de foto no Supabase Storage.
 */
export function gerarNomeArquivoAvatar(userId: string, timestamp?: number): string {
  return `avatar_${userId}_${timestamp || Date.now()}.jpg`;
}

/**
 * Valida os dados para edição do próprio perfil pelo morador logado.
 * Se o morador não for admin, a geração não pode ser alterada.
 */
export function validarEdicaoMeuPerfil(
  input: EdicaoMeuPerfilInput,
  perfilAtual: Pick<Profile, 'role' | 'geracao'>
): EdicaoMeuPerfilResult {
  const apelidoLimpo = input.apelido?.trim();
  if (!apelidoLimpo) {
    throw new Error('O apelido na república é obrigatório.');
  }

  const nomeLimpo = input.nome?.trim();
  if (!nomeLimpo) {
    throw new Error('O nome completo é obrigatório.');
  }

  const payload: EdicaoMeuPerfilResult = {
    apelido: apelidoLimpo,
    nome: nomeLimpo,
    quarto_id: input.quarto_id || null,
  };

  if (input.avatar_url !== undefined) {
    payload.avatar_url = input.avatar_url;
  }

  const isAdmin = perfilAtual.role === 'admin';

  if (input.geracao !== undefined && input.geracao !== null) {
    const novaGeracaoLimpa = input.geracao.trim();
    if (!isAdmin) {
      if (perfilAtual.geracao && novaGeracaoLimpa !== perfilAtual.geracao) {
        throw new Error('Apenas administradores podem alterar a geração de um morador.');
      }
    } else {
      if (!novaGeracaoLimpa) {
        throw new Error('A geração não pode ficar vazia.');
      }
      payload.geracao = novaGeracaoLimpa;
    }
  }

  return payload;
}

/**
 * Verifica se o usuário tem privilégio ativo de Admin para gerenciar moradores.
 */
export function podeAcessarGestaoMoradores(profile: Pick<Profile, 'role' | 'ativo'> | null | undefined): boolean {
  return !!profile && profile.ativo === true && profile.role === 'admin';
}

export interface ValidarAcaoAdminParams {
  adminLogadoId: string;
  alvoId: string;
  acao: 'rebaixar' | 'desativar' | 'excluir' | 'editar';
  novoRole?: UserRole;
  novoAtivo?: boolean;
}

export interface ValidarAcaoAdminResult {
  permitido: boolean;
  motivo?: string;
}

/**
 * Valida proteções contra auto-rebaixamento, auto-desativação e auto-exclusão do Admin logado.
 */
export function validarAcoesAdmin({
  adminLogadoId,
  alvoId,
  acao,
  novoRole,
  novoAtivo,
}: ValidarAcaoAdminParams): ValidarAcaoAdminResult {
  const isProprioAdmin = adminLogadoId === alvoId;

  if (isProprioAdmin) {
    if (acao === 'rebaixar' || (novoRole && novoRole !== 'admin')) {
      return {
        permitido: false,
        motivo: 'Você não pode rebaixar seu próprio perfil de Admin.',
      };
    }

    if (acao === 'desativar' || novoAtivo === false) {
      return {
        permitido: false,
        motivo: 'Você não pode desativar seu próprio acesso.',
      };
    }

    if (acao === 'excluir') {
      return {
        permitido: false,
        motivo: 'Você não pode excluir sua própria conta de Administrador.',
      };
    }
  }

  return { permitido: true };
}

export interface EdicaoMoradorAdminInput {
  apelido: string;
  nome: string;
  geracao: string;
  quarto_id: string | null;
  role: UserRole;
  avatar_url?: string | null;
}

/**
 * Validação do formulário de edição de morador pelo Administrador.
 */
export function validarEdicaoMoradorAdmin(input: EdicaoMoradorAdminInput): EdicaoMoradorAdminInput {
  const apelidoLimpo = input.apelido?.trim();
  if (!apelidoLimpo) {
    throw new Error('Informe o apelido do morador.');
  }

  const nomeLimpo = input.nome?.trim();
  if (!nomeLimpo) {
    throw new Error('Informe o nome do morador.');
  }

  const geracaoLimpa = input.geracao?.trim();
  if (!geracaoLimpa) {
    throw new Error('Informe a geração do morador (ex: 025).');
  }

  if (input.role !== 'admin' && input.role !== 'morador' && input.role !== 'externo') {
    throw new Error('Cargo (role) inválido.');
  }

  return {
    apelido: apelidoLimpo,
    nome: nomeLimpo,
    geracao: geracaoLimpa,
    quarto_id: input.quarto_id || null,
    role: input.role,
    avatar_url: input.avatar_url !== undefined ? input.avatar_url : undefined,
  };
}

export interface EdicaoConvidadoAdminInput {
  apelido: string;
  nome: string;
  telefone_contato: string;
}

/**
 * Validação do formulário de edição de convidado pelo Administrador.
 */
export function validarEdicaoConvidadoAdmin(input: EdicaoConvidadoAdminInput): EdicaoConvidadoAdminInput {
  const apelidoLimpo = input.apelido?.trim();
  if (!apelidoLimpo) {
    throw new Error('Informe o apelido do convidado.');
  }

  const telefoneLimpo = input.telefone_contato?.trim();
  if (!telefoneLimpo) {
    throw new Error('Informe o telefone/WhatsApp do convidado.');
  }

  return {
    apelido: apelidoLimpo,
    nome: input.nome?.trim() || apelidoLimpo,
    telefone_contato: telefoneLimpo,
  };
}
