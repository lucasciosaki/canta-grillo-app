import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingScreen } from './LoadingScreen';
import { PendingApprovalScreen } from './PendingApprovalScreen';
import { AuthScreen } from '../../features/auth/AuthScreen';
import { ConvidadoScreen } from '../../features/convidados/ConvidadoScreen';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Route Guard para proteção da República Canta Grillo.
 * 
 * Fluxo de verificação resiliente:
 * 1. loading === true: Exibe tela de carregamento breve (com timeout de segurança de 2.5s para nunca travar).
 * 2. !user: Exibe tela de autenticação (Login / Cadastro de morador ou convidado).
 * 3. profile.ativo === false: Bloqueia acesso e exibe tela de "Cadastro em Análise" (moradores da casa).
 * 4. profile.role === 'externo': Redireciona para tela dedicada do Convidado (isolamento de segurança total).
 * 5. Morador autenticado e ativo -> Acesso liberado à Home e demais telas da república.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, profile, loading, signOut } = useAuth();
  const [safetyTimeout, setSafetyTimeout] = useState(false);

  // Timeout de segurança: nunca fica preso no loading por mais de 2.5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      setSafetyTimeout(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // 1. Splash / Loading Screen breve apenas durante verificação inicial da sessão
  if (loading && !safetyTimeout) {
    return <LoadingScreen message="Verificando acesso à casa..." onSignOut={signOut} />;
  }

  // 2. Não autenticado -> Tela de Login / Cadastro
  if (!user) {
    return <AuthScreen />;
  }

  // 3. Morador expressamente pendente de aprovação pelo Administrador
  // Bloqueia rigorosamente o acesso à Home e dados internos
  if (profile && profile.ativo === false) {
    return <PendingApprovalScreen />;
  }

  // 4. Convidado Externo: Acesso restrito e exclusivo à tela de refeições do convidado
  if (profile?.role === 'externo') {
    return <ConvidadoScreen />;
  }

  // 5. Usuário autenticado e ativo -> Acesso liberado à Home e demais telas
  return <>{children}</>;
};
