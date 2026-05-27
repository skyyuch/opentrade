'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useNotifications } from '../../hooks/useNotifications';
import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';

import type { NotificationItem } from '../../lib/api/client';

function useRelativeTime() {
  const t = useTranslations('notifications');

  return useCallback(
    (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 1) return t('timeJustNow');
      if (minutes < 60) return t('timeMinutesAgo', { count: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t('timeHoursAgo', { count: hours });
      const days = Math.floor(hours / 24);
      if (days < 7) return t('timeDaysAgo', { count: days });
      const weeks = Math.floor(days / 7);
      return t('timeWeeksAgo', { count: weeks });
    },
    [t],
  );
}

function NotificationRow({
  notification,
  onRead,
  formatTime,
}: {
  notification: NotificationItem;
  onRead: (id: string) => void;
  formatTime: (iso: string) => string;
}) {
  const isUnread = !notification.readAt;

  return (
    <div
      onClick={() => onRead(notification.id)}
      className="flex cursor-pointer items-start justify-between px-5 py-4 transition-colors hover:bg-white/5"
    >
      <div className="flex flex-col gap-1 pr-4">
        <span className={`text-sm font-medium ${isUnread ? 'text-white/90' : 'text-white/60'}`}>
          {notification.title}
        </span>
        {notification.body && (
          <span className="mt-0.5 font-mono text-xs text-white/50">{notification.body}</span>
        )}
        <span className="mt-1.5 text-[11px] text-white/30">
          {formatTime(notification.createdAt)}
        </span>
      </div>
      {isUnread && (
        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#00FF88] shadow-[0_0_8px_#00FF88]" />
      )}
    </div>
  );
}

export function NotificationBell() {
  const { getAccessToken } = useOpenTradeAuth();
  const { unreadCount, notifications, isLoading, loadNotifications, markRead, markAllRead } =
    useNotifications(getAccessToken);
  const t = useTranslations('notifications');
  const formatTime = useRelativeTime();

  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) void loadNotifications();
      return next;
    });
  }, [loadNotifications]);

  const handleMarkRead = useCallback(
    (id: string) => {
      void markRead(id);
    },
    [markRead],
  );

  const handleMarkAllRead = useCallback(() => {
    void markAllRead();
  }, [markAllRead]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex items-center p-1 text-white/40 transition-colors hover:text-white"
        aria-label={t('title')}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-red-500/20">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-3 flex min-w-[320px] max-w-[380px] origin-top-right flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-4">
            <span className="text-sm font-bold text-white">{t('title')}</span>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-white/40 transition-colors hover:text-white"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] w-full overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              </div>
            ) : notifications.length > 0 ? (
              <div className="flex flex-col divide-y divide-white/5">
                {notifications.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onRead={handleMarkRead}
                    formatTime={formatTime}
                  />
                ))}
                <div className="bg-white/[0.01] py-4 text-center text-[11px] text-white/30">
                  {t('noMore')}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 bg-white/[0.01] py-12">
                <Bell size={32} className="text-white/10" />
                <span className="text-sm text-white/30">{t('empty')}</span>
                <span className="max-w-[240px] text-center text-xs text-white/20">
                  {t('emptyDesc')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mobile notification section for the hamburger menu.
 * Renders inline (not a dropdown) — matching Google design.
 */
export function MobileNotificationSection() {
  const { getAccessToken } = useOpenTradeAuth();
  const { unreadCount, notifications, loadNotifications, markRead, markAllRead } =
    useNotifications(getAccessToken);
  const t = useTranslations('notifications');
  const formatTime = useRelativeTime();

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-white/80">
        <span className="font-bold">
          {t('title')} ({unreadCount})
        </span>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-xs text-white/40 hover:text-white"
          >
            {t('markAllRead')}
          </button>
        )}
      </div>
      <div className="flex max-h-[300px] w-full flex-col overflow-y-auto rounded-xl border border-white/10 bg-white/5">
        {notifications.length > 0 ? (
          <div className="flex flex-col divide-y divide-white/5">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => void markRead(n.id)}
                className="flex items-start justify-between px-4 py-3 transition-colors active:bg-white/10"
              >
                <div className="flex flex-col gap-1 pr-4">
                  <span
                    className={`text-sm font-medium ${!n.readAt ? 'text-white/90' : 'text-white/60'}`}
                  >
                    {n.title}
                  </span>
                  <span className="mt-1 text-[11px] text-white/40">{formatTime(n.createdAt)}</span>
                </div>
                {!n.readAt && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#00FF88]" />}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Bell size={24} className="text-white/10" />
            <span className="text-xs text-white/30">{t('empty')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
