/** One dream journal entry. One entry per calendar day, keyed by `date`. */
export type Dream = {
  /** Stable id (the date key doubles as the id since there's one entry per day). */
  id: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** The dream, as free text (typed or dictated). */
  text: string;
  createdAt: number;
  updatedAt: number;
};

/** Local `YYYY-MM-DD` for a Date (defaults to now). Timezone-safe (uses local parts). */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a `YYYY-MM-DD` key into a local Date at midnight. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Friday, July 10, 2026" */
export function formatLong(key: string): string {
  const d = keyToDate(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Fri, Jul 10" */
export function formatShort(key: string): string {
  const d = keyToDate(key);
  return `${WEEKDAYS[d.getDay()]?.slice(0, 3)}, ${MONTHS[d.getMonth()]?.slice(0, 3)} ${d.getDate()}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** Relative label for a date key vs today: "today", "yesterday", "3 days ago", or "". */
export function relativeLabel(key: string): string {
  const today = keyToDate(dateKey());
  const then = keyToDate(key);
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days <= 30) return `${days} days ago`;
  if (days === -1) return 'tomorrow';
  return '';
}
