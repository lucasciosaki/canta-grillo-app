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
