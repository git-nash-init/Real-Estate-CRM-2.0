import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const HIGHLIGHT_CLASS = 'ring-2 ring-indigo-500 ring-inset bg-indigo-50';

const HIGHLIGHT_DURATION_MS = 3000;
const WATCHDOG_MS = 8000;

/**
 * Shared "a notification linked here" affordance for list pages: reads
 * ?highlight=<id>&hlKind=<entity>&hl=<timestamp> from the URL, lets a page
 * register its row elements by id, and exposes tryFocusRow() to scroll the
 * matching row into view with a temporary highlight ring once the page's
 * data has loaded. The query params are stripped only after the row is
 * found (or the watchdog gives up) since list loads are async.
 */
export function useHighlightParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightKind = searchParams.get('hlKind');
  const hl = searchParams.get('hl');

  const [activeId, setActiveId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumedHl = useRef<string | null>(null);

  const registerRow = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  }, []);

  const clearHighlightParam = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('highlight');
      next.delete('hlKind');
      next.delete('hl');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Attempts to scroll+highlight the row for the current highlightId.
  // Returns true if it found the row. Safe to call repeatedly (e.g. after
  // each data refresh) -- it no-ops once the same `hl` has been consumed.
  const tryFocusRow = useCallback(() => {
    if (!highlightId || !hl || consumedHl.current === hl) return false;
    const el = rows.current.get(highlightId);
    if (!el) return false;

    consumedHl.current = hl;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setActiveId(highlightId);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setActiveId(null), HIGHLIGHT_DURATION_MS);
    if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
    clearHighlightParam();
    return true;
  }, [highlightId, hl, clearHighlightParam]);

  // Watchdog: if nothing claims the highlight within a reasonable window
  // (row never rendered -- filtered out, wrong page, etc.), strip the
  // params anyway so they don't linger in the URL forever.
  useEffect(() => {
    if (!highlightId || !hl || consumedHl.current === hl) return;
    watchdogTimer.current = setTimeout(() => {
      if (consumedHl.current !== hl) {
        consumedHl.current = hl;
        clearHighlightParam();
      }
    }, WATCHDOG_MS);
    return () => {
      if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, hl]);

  useEffect(() => () => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
  }, []);

  const rowClass = (id: string) => (activeId === id ? HIGHLIGHT_CLASS : '');

  return { highlightId, highlightKind, activeId, registerRow, rowClass, tryFocusRow, clearHighlightParam };
}
