import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from './useAuth';

/**
 * Per-user sidebar nav pinning (AppLayout.tsx). Backed by `sidebar_pins`
 * (user_id, nav_path), RLS-scoped to auth.uid() -- see the migration in
 * `supabase/migrations/*_create_sidebar_pins.sql`. Pins are purely a
 * reorder/duplicate-to-top of items the user can already see; this hook
 * never affects what nav items a role is allowed to view.
 */
export function useSidebarPins() {
  const { user } = useAuth();
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const fetchPins = useCallback(async () => {
    if (!user) { setPinnedPaths(new Set()); setLoaded(true); return; }
    const { data, error } = await supabase
      .from('sidebar_pins')
      .select('nav_path')
      .eq('user_id', user.id);
    if (error) {
      reportQueryError('Sidebar pins: fetch', error);
      setLoaded(true);
      return;
    }
    setPinnedPaths(new Set((data || []).map((r) => r.nav_path as string)));
    setLoaded(true);
  }, [user]);

  useEffect(() => { fetchPins(); }, [fetchPins]);

  const togglePin = async (navPath: string) => {
    if (!user) return;
    const isPinned = pinnedPaths.has(navPath);
    // Optimistic update -- this is a small personal preference, not
    // business data, so we don't block the UI on the round trip.
    setPinnedPaths((prev) => {
      const next = new Set(prev);
      if (isPinned) next.delete(navPath); else next.add(navPath);
      return next;
    });

    if (isPinned) {
      const { error } = await supabase
        .from('sidebar_pins')
        .delete()
        .eq('user_id', user.id)
        .eq('nav_path', navPath);
      if (error) { reportQueryError('Sidebar pins: unpin', error); fetchPins(); }
    } else {
      const { error } = await supabase
        .from('sidebar_pins')
        .insert({ user_id: user.id, nav_path: navPath });
      if (error) { reportQueryError('Sidebar pins: pin', error); fetchPins(); }
    }
  };

  return { pinnedPaths, togglePin, loaded };
}
