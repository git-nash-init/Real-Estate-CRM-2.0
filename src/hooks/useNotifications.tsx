import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from './useAuth';

export interface AppNotification {
  id: string;
  notification_type: string | null;
  title: string | null;
  message: string | null;
  related_entity: string | null;
  related_id: string | null;
  is_read: boolean | null;
  created_at: string;
}

/**
 * Central notification feed: initial fetch + a Supabase Realtime
 * subscription so a task assignment (or anything else that writes to
 * `notifications`) shows up as a live popup without a page refresh. Used by
 * the sidebar bell (AppLayout) and can be reused anywhere else that needs
 * the current user's notifications.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [justArrived, setJustArrived] = useState<AppNotification | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) reportQueryError('Notifications: fetch', error);
    else setNotifications(data || []);
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const notif = payload.new as AppNotification;
          setNotifications((prev) => [notif, ...prev]);
          setJustArrived(notif);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) reportQueryError('Notifications: mark read', error);
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);
    if (error) reportQueryError('Notifications: mark all read', error);
  };

  const dismissJustArrived = () => setJustArrived(null);

  return { notifications, unreadCount, markAsRead, markAllAsRead, justArrived, dismissJustArrived, refetch: fetchNotifications };
}
