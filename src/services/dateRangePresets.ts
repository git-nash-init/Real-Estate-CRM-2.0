/**
 * Shared date-range presets for report filtering. Everything resolves to a
 * half-open [start, end) ISO range so callers can filter with
 * `.gte(col, start).lt(col, end)` — no off-by-one on the last day of a
 * range from a plain `<=` comparison against a date-only string.
 */

export type DateRangePreset =
  | 'today' | 'yesterday' | 'tomorrow'
  | 'this_week' | 'this_month' | 'this_year'
  | 'custom';

export interface ResolvedDateRange {
  /** Inclusive start, as an ISO instant. */
  startISO: string;
  /** Exclusive end, as an ISO instant. */
  endISO: string;
  label: string;
}

const startOfDay = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const presetOptions: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

/**
 * Resolves a preset (or explicit custom bounds) to a concrete range.
 * `customStart`/`customEnd` are plain `YYYY-MM-DD` strings from a date
 * input; the end date is treated as inclusive (its whole day is included).
 */
export function resolveDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): ResolvedDateRange {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { startISO: today.toISOString(), endISO: addDays(today, 1).toISOString(), label: 'Today' };

    case 'yesterday': {
      const start = addDays(today, -1);
      return { startISO: start.toISOString(), endISO: today.toISOString(), label: 'Yesterday' };
    }

    case 'tomorrow': {
      const start = addDays(today, 1);
      return { startISO: start.toISOString(), endISO: addDays(start, 1).toISOString(), label: 'Tomorrow' };
    }

    case 'this_week': {
      // Monday-start week, matching how the rest of this app's date
      // handling assumes IST business days rather than Sunday-start.
      const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = addDays(today, -diffToMonday);
      return { startISO: start.toISOString(), endISO: addDays(start, 7).toISOString(), label: 'This Week' };
    }

    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { startISO: start.toISOString(), endISO: end.toISOString(), label: 'This Month' };
    }

    case 'this_year': {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear() + 1, 0, 1);
      return { startISO: start.toISOString(), endISO: end.toISOString(), label: 'This Year' };
    }

    case 'custom': {
      if (!customStart || !customEnd) {
        // No valid custom range yet — fall back to "all time" rather than
        // an arbitrary default, so the report doesn't silently show the
        // wrong window while the user is still picking dates.
        return { startISO: new Date(0).toISOString(), endISO: addDays(today, 1).toISOString(), label: 'All Time' };
      }
      const start = new Date(`${customStart}T00:00:00`);
      const end = addDays(new Date(`${customEnd}T00:00:00`), 1); // inclusive end date
      return { startISO: start.toISOString(), endISO: end.toISOString(), label: `${customStart} to ${customEnd}` };
    }
  }
}
