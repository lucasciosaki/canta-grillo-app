import React from 'react';
import { Bell, LogOut } from 'lucide-react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  unreadNotifications?: number;
  onNotificationsClick?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Canta Grillo',
  subtitle = 'Desde 2004',
  unreadNotifications = 0,
  onNotificationsClick,
  onSignOut,
}) => (
  <header className="sticky top-0 z-40 bg-paper border-b border-line px-5 py-3 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <img
        src="/logo.png"
        alt="Canta Grillo"
        className="w-8 h-8 rounded-full object-cover"
      />
      <div className="leading-tight">
        <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>

    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onNotificationsClick}
        aria-label="Notificações"
        className="relative p-1.5 text-ink hover:text-forest transition-colors rounded-lg"
      >
        <Bell className="w-5 h-5" strokeWidth={1.8} />
        {unreadNotifications > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-clay text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-xs">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </button>

      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sair da conta"
          title="Sair da conta"
          className="p-1.5 text-muted hover:text-clay transition-colors"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.8} />
        </button>
      )}
    </div>
  </header>
);
