import React, { useState } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  AlertTriangle,
  MessageSquare,
  Wrench,
  ShoppingCart,
  Dog,
  Utensils,
  Beer,
  Shield,
  ChevronRight,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import {
  type AppNotification,
  type NotificationCategory,
  type NotificationTargetScreen,
  formatNotificationRelativeTime,
} from '../../types/notificacoes';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  permission: NotificationPermission | 'unsupported';
  onRequestPermission: () => Promise<NotificationPermission>;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNavigate: (targetScreen: NotificationTargetScreen, params?: Record<string, any>) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  permission,
  onRequestPermission,
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigate,
  onRefresh,
  isRefreshing,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  const getCategoryIcon = (category: NotificationCategory, urgency: string) => {
    if (urgency === 'urgent') {
      return <AlertTriangle className="w-4 h-4 text-clay" strokeWidth={2.2} />;
    }
    switch (category) {
      case 'ponto_bagunca':
        return <AlertTriangle className="w-4 h-4 text-clay" strokeWidth={2} />;
      case 'quadro_faxina':
        return <Shield className="w-4 h-4 text-forest" strokeWidth={2} />;
      case 'chat_frente':
        return <MessageSquare className="w-4 h-4 text-forest" strokeWidth={2} />;
      case 'funca':
        return <Wrench className="w-4 h-4 text-ink" strokeWidth={2} />;
      case 'mercado':
        return <ShoppingCart className="w-4 h-4 text-forest" strokeWidth={2} />;
      case 'dogs':
        return <Dog className="w-4 h-4 text-forest" strokeWidth={2} />;
      case 'misturas':
        return <Utensils className="w-4 h-4 text-clay" strokeWidth={2} />;
      case 'cerveja':
        return <Beer className="w-4 h-4 text-amber-600" strokeWidth={2} />;
      case 'admin':
        return <ShieldAlert className="w-4 h-4 text-purple-700" strokeWidth={2} />;
      default:
        return <Bell className="w-4 h-4 text-muted" strokeWidth={2} />;
    }
  };

  const handleItemClick = (notification: AppNotification) => {
    onMarkAsRead(notification.id);
    onClose();
    onNavigate(notification.targetScreen, notification.targetParams);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md bg-paper h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Header do Drawer */}
        <div className="px-5 py-4 border-b border-line bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-paper rounded-full text-forest">
              <Bell className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                Notificações
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-clay text-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted">Avisos e lembretes da república</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Forçar sincronização com o banco"
                className="p-2 text-muted hover:text-forest transition-colors rounded-lg cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-forest' : ''}`} />
              </button>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                title="Marcar todas como lidas"
                className="p-2 text-muted hover:text-forest transition-colors rounded-lg flex items-center gap-1 text-xs"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Lidas</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 text-muted hover:text-ink transition-colors rounded-lg"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Banner de Ativação do Browser Push */}
        {permission === 'default' && (
          <div className="mx-5 mt-4 p-3.5 bg-surface border border-line rounded-xl flex items-center justify-between gap-3 shadow-2xs">
            <div className="text-xs">
              <p className="font-semibold text-ink">Ativar Notificações no Celular</p>
              <p className="text-muted text-[11px] mt-0.5">
                Receba alertas de pontos, fotos da faxina e misturas.
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestPermission}
              className="shrink-0 px-3 py-1.5 bg-forest hover:bg-forest-dark text-white text-xs font-medium rounded-lg transition-colors shadow-2xs active:scale-95"
            >
              Ativar
            </button>
          </div>
        )}

        {/* Filtros: Todas / Não lidas */}
        <div className="px-5 pt-3 pb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === 'all'
                ? 'bg-forest text-white'
                : 'bg-surface border border-line text-muted hover:text-ink'
            }`}
          >
            Todas ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === 'unread'
                ? 'bg-forest text-white'
                : 'bg-surface border border-line text-muted hover:text-ink'
            }`}
          >
            Não lidas ({unreadCount})
          </button>
        </div>

        {/* Lista de Notificações */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div className="py-16 text-center text-muted">
              <div className="w-12 h-12 mx-auto rounded-full bg-surface border border-line flex items-center justify-center text-muted mb-3">
                <Bell className="w-6 h-6 strokeWidth={1.5}" />
              </div>
              <p className="text-sm font-medium text-ink">Nenhuma notificação</p>
              <p className="text-xs text-muted mt-1">
                {filter === 'unread'
                  ? 'Você já leu todas as suas notificações!'
                  : 'Tudo tranquilo na Canta Grillo por enquanto.'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const isUrgent = n.urgency === 'urgent';
              return (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  role="button"
                  tabIndex={0}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative flex items-start gap-3 active:scale-[0.99] ${
                    isUrgent
                      ? 'bg-clay/5 border-clay/30 hover:border-clay/50 shadow-2xs'
                      : n.read
                      ? 'bg-surface/60 border-line/70 opacity-80 hover:opacity-100'
                      : 'bg-surface border-line shadow-2xs hover:border-forest/40'
                  }`}
                >
                  {/* Ícone da categoria */}
                  <div
                    className={`shrink-0 p-2 rounded-lg ${
                      isUrgent
                        ? 'bg-clay/10 text-clay'
                        : n.read
                        ? 'bg-paper text-muted'
                        : 'bg-paper text-forest'
                    }`}
                  >
                    {getCategoryIcon(n.category, n.urgency)}
                  </div>

                  {/* Conteúdo textual */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`text-xs font-semibold truncate ${
                          isUrgent ? 'text-clay font-bold' : n.read ? 'text-ink/80' : 'text-ink'
                        }`}
                      >
                        {n.title}
                      </h4>
                      <span className="text-[10px] text-muted shrink-0">
                        {formatNotificationRelativeTime(n.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-ink/90 mt-1 leading-snug line-clamp-2">
                      {n.message}
                    </p>
                  </div>

                  {/* Indicador de não lida e seta */}
                  <div className="shrink-0 flex items-center gap-1.5 self-center">
                    {!n.read && (
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isUrgent ? 'bg-clay' : 'bg-forest'
                        }`}
                      />
                    )}
                    <ChevronRight className="w-4 h-4 text-muted/60" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="p-4 border-t border-line bg-surface/50 text-center">
          <p className="text-[11px] text-muted">
            Toque em qualquer notificação para ir direto à tela correspondente.
          </p>
        </div>
      </div>
    </div>
  );
};
