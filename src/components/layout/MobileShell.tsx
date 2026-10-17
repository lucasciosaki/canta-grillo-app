import React from 'react';
import { Header } from './Header';
import { BottomNav, type MainTab } from './BottomNav';

interface MobileShellProps {
  children: React.ReactNode;
  currentTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  title?: string;
  subtitle?: string;
  unreadNotifications?: number;
  onNotificationsClick?: () => void;
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
  onSignOut,
}) => (
  <div className="min-h-dvh bg-paper text-ink">
    <div className="w-full max-w-md mx-auto min-h-dvh flex flex-col">
      <Header
        title={title}
        subtitle={subtitle}
        unreadNotifications={unreadNotifications}
        onNotificationsClick={onNotificationsClick}
        onSignOut={onSignOut}
      />
      <main className="flex-1 px-5 py-4 pb-24">{children}</main>
      <BottomNav currentTab={currentTab} onTabChange={onTabChange} />
    </div>
  </div>
);
