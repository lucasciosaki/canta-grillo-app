import React from 'react';
import { Header } from './Header';
import { BottomNav, type MainTab } from './BottomNav';
import { OfflineBanner } from '../feedback/PWAInstallBanner';

interface MobileShellProps {
  children: React.ReactNode;
  currentTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  title?: string;
  subtitle?: string;
  unreadNotifications?: number;
  onNotificationsClick?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onSignOut?: () => void;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  currentTab,
  onTabChange,
  title,
  subtitle,
  unreadNotifications = 0,
  onNotificationsClick,
  onRefresh,
  isRefreshing,
  onSignOut,
}) => (
  <div className="min-h-dvh bg-paper text-ink">
    <div className="w-full max-w-md mx-auto min-h-dvh flex flex-col">
      <OfflineBanner />
      <Header
        title={title}
        subtitle={subtitle}
        unreadNotifications={unreadNotifications}
        onNotificationsClick={onNotificationsClick}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onSignOut={onSignOut}
      />
      <main className="flex-1 px-5 py-4 pb-24">{children}</main>
      <BottomNav currentTab={currentTab} onTabChange={onTabChange} />
    </div>
  </div>
);
