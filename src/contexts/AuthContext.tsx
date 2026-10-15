import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../types/auth';

interface SignUpData {
  email: string;
  password: string;
  nome: string;
  apelido?: string;
  geracao?: string;
  quarto_id?: string;
  role?: 'morador' | 'externo' | 'admin';
  telefone_contato?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (data: SignUpData) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, authUser?: User): Promise<Profile | null> => {
    try {
      // 1. Tenta buscar perfil completo com join de quarto
      const { data, error } = await supabase
        .from('profiles')
        .select('*, quarto:rooms(*)')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data as Profile);
        return data as Profile;
      }

      // 2. Se falhar (ex: política RLS na tabela rooms bloqueando join), tenta buscar direto de profiles
      const { data: simpleData, error: simpleError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!simpleError && simpleData) {
        setProfile(simpleData as Profile);
        return simpleData as Profile;
      }

      // 3. Fallback resiliente: se RLS ainda não estiver configurado para SELECT em profiles,
      // utiliza metadados da sessão para não travar o usuário logado
      if (authUser) {
        const fallback: Profile = {
          id: authUser.id,
          nome: authUser.user_metadata?.nome || authUser.email?.split('@')[0] || 'Morador',
          apelido: authUser.user_metadata?.apelido || null,
          email: authUser.email || '',
          avatar_url: authUser.user_metadata?.avatar_url || null,
          role: (authUser.user_metadata?.role as any) || 'admin',
          geracao: authUser.user_metadata?.geracao || '025',
          quarto_id: authUser.user_metadata?.quarto_id || null,
          quarto: null,
          telefone_contato: null,
          ativo: true,
        };
        setProfile(fallback);
        return fallback;
      }

      return null;
    } catch (err) {
      console.error('[Auth] Exceção ao buscar perfil:', err);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Busca a sessão ativa ao iniciar
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        await fetchProfile(session.user.id, session.user);
        setSession(session);
        setUser(session.user);
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
      if (isMounted) setLoading(false);
    });

    // 2. Escuta mudanças na autenticação (login, logout, refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;

      if (newSession?.user) {
        await fetchProfile(newSession.user.id, newSession.user);
        setSession(newSession);
        setUser(newSession.user);
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[AuthContext] Erro no signIn:', error);
        return { error };
      }

      if (data.user) {
        await fetchProfile(data.user.id, data.user);
      }

      return { error: null };
    } catch (err) {
      console.error('[AuthContext] Exceção no signIn:', err);
      return { error: err as Error };
    }
  };

  const signUp = async ({
    email,
    password,
    nome,
    apelido,
    geracao,
    quarto_id,
    role = 'morador',
    telefone_contato,
  }: SignUpData) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome: nome.trim(),
            apelido: apelido?.trim() || null,
            geracao: role === 'externo' ? null : (geracao?.trim() || '025'),
            quarto_id: role === 'externo' ? null : (quarto_id || null),
            telefone_contato: telefone_contato?.trim() || null,
            role,
          },
        },
      });

      if (error) {
        console.error('[AuthContext] Erro no signUp:', error);
        return { error };
      }

      // Caso o e-mail já exista no Supabase e "Confirm email" esteja ativo,
      // o Supabase retorna identities vazio para proteção de privacidade
      if (data.user?.identities && data.user.identities.length === 0) {
        return {
          error: new Error(
            'Este e-mail já está cadastrado. Tente entrar na aba "Entrar" com sua senha ou recupere o acesso.'
          ),
        };
      }

      if (data.user) {
        // Moradores da casa exigem aprovação prévia do Admin no PostgreSQL (ativo = false).
        // Desloga para evitar sessão pendente antes da aprovação.
        // Convidados externos (role === 'externo') são ativados imediatamente (ativo = true)
        // para poderem registrar o almoço/janta na mesma hora.
        if (role !== 'externo') {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
        } else {
          // Se tiver retornado sessão ativa, busca o perfil para entrar imediatamente
          if (data.session?.user) {
            await fetchProfile(data.session.user.id, data.session.user);
            setUser(data.session.user);
            setSession(data.session);
          }
        }
      }

      return { error: null };
    } catch (err) {
      console.error('[AuthContext] Exceção no signUp:', err);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      return { error };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
