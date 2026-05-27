'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/api/client';

import type { NotificationItem } from '../lib/api/client';

const POLL_INTERVAL_MS = 30_000;
const LIST_LIMIT = 20;

/**
 * Hook that manages notification state with 30s unread-count polling.
 *
 * - Polls `GET /v1/notifications/unread-count` every 30s (pauses when tab hidden)
 * - Fetches full list on demand (when dropdown opens)
 * - Provides optimistic mark-read / mark-all-read
 */
export function useNotifications(getAccessToken: () => Promise<string | null>) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollUnreadCount = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetchUnreadCount({ accessToken: token });
      setUnreadCount(res.count);
    } catch {
      // Swallow — polling failure is non-critical
    }
  }, [getAccessToken]);

  // Start/stop polling based on visibility
  useEffect(() => {
    const start = () => {
      void pollUnreadCount();
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => void pollUnreadCount(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pollUnreadCount]);

  const loadNotifications = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetchNotifications({ accessToken: token, limit: LIST_LIMIT });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Swallow — UI stays with stale list
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      const token = await getAccessToken();
      if (!token) return;
      try {
        await markNotificationRead(id, { accessToken: token });
      } catch {
        // Revert on failure
        void loadNotifications();
      }
    },
    [getAccessToken, loadNotifications],
  );

  const markAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnreadCount(0);

    const token = await getAccessToken();
    if (!token) return;
    try {
      await markAllNotificationsRead({ accessToken: token });
    } catch {
      void loadNotifications();
    }
  }, [getAccessToken, loadNotifications]);

  return {
    unreadCount,
    notifications,
    isLoading,
    loadNotifications,
    markRead,
    markAllRead,
  } as const;
}
