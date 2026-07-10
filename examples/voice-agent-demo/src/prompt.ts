import { dateKey, formatLong, relativeLabel, type Dream } from './types';

/** How many recent entries to include in the agent's context. */
const MAX_ENTRIES = 60;

/**
 * Build the Voice Agent system prompt from the journal.
 *
 * The whole (recent) journal is embedded inline so the agent can answer any
 * reference — "compare today to yesterday", "what recurring themes show up",
 * "read me last Tuesday's dream" — without a tool round-trip. Each entry is
 * tagged with its date and a relative label so relative asks resolve cleanly.
 */
export function buildJournalSystemPrompt(dreams: Dream[]): string {
  const today = dateKey();
  const recent = dreams.slice(0, MAX_ENTRIES); // dreams arrive newest-first

  const entries = recent.length
    ? recent
        .map((d) => {
          const rel = relativeLabel(d.date);
          const tag = rel ? `${formatLong(d.date)} (${rel})` : formatLong(d.date);
          return `- ${tag}:\n  ${d.text.replace(/\n/g, '\n  ')}`;
        })
        .join('\n')
    : '(The journal is empty so far — the user has not recorded any dreams yet.)';

  return [
    "You are a warm, insightful dream journal companion. The user talks to you by voice about their dreams.",
    `Today is ${formatLong(today)}.`,
    '',
    'Guidelines:',
    '- Keep spoken replies to a sentence or two unless the user asks you to go deeper.',
    '- When the user references a specific day ("today", "yesterday", a weekday, a date), use the matching entry below. If there is no entry for that day, say so plainly.',
    '- You can compare dreams across days, surface recurring people/places/themes, and reflect gently. Do not invent dreams that are not recorded below.',
    '- You are a supportive companion, not a clinician; avoid definitive psychological or medical interpretations.',
    '',
    "The user's recorded dreams (most recent first):",
    entries,
  ].join('\n');
}
