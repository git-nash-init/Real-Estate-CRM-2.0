import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

export interface WaSentToast {
  id: string;
  to_phone: string | null;
  message: string | null;
}

/**
 * Listens to real-time UPDATE events on whatsapp_outbox.
 * Whenever a row transitions to status='sent', surfaces a short-lived
 * toast so the user gets instant feedback that the WhatsApp message was
 * delivered by the gateway — without having to open the outbox table.
 *
 * The subscription is unconditional (no user filter) because the outbox is
 * a shared queue and any admin-level user cares about delivery confirmations
 * for messages they queued. The RLS policy on whatsapp_outbox already limits
 * what rows the anon/authed key can see at the Supabase Realtime level.
 */
export function useWhatsAppSentToast() {
  const [toast, setToast] = useState<WaSentToast | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-outbox-sent')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_outbox',
          // Only fire when status becomes 'sent'
          filter: 'status=eq.sent',
        },
        (payload) => {
          const row = payload.new as { id: string; to_phone: string | null; message: string | null; status: string };
          if (row.status === 'sent') {
            setToast({
              id: row.id,
              to_phone: row.to_phone,
              message: row.message,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return { toast, dismiss };
}
