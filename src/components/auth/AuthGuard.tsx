import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingScreen } from './LoadingScreen';
import { PendingApprovalScreen } from './PendingApprovalScreen';
import { AuthScreen } from '../../features/auth/AuthScreen';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Route Guard para proteção da República Canta Grillo.
 * 
 * Fluxo de verificação resiliente:
 * 1. loading === true: Exibe tela de carregamento breve (com timeout de segurança de 2.5s para nunca travar).
 * 2. !user: Exibe tela de autenticação (Login / Cadastro de novo morador).
 * 3. profile.ativo === false: Bloqueia acesso e exibe tela de "Cadastro em Análise".
 * 4. Acesso liberado: Renderiza a aplicação interna imediatamente.
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

  // 4. Usuário autenticado e ativo -> Acesso liberado à Home e demais telas
  return <>{children}</>;
};
