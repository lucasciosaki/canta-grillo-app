export type UserRole = 'admin' | 'morador' | 'externo';

export interface Room {
  id: string;
  nome: string;
  capacidade: number;
  created_at?: string;
}

export interface Profile {
  id: string;
  nome: string;
  apelido: string | null;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  ativo: boolean;
  geracao: string | null;
  quarto_id: string | null;
  quarto?: Room | null;
  telefone_contato: string | null;
  created_at?: string;
  updated_at?: string;
}
