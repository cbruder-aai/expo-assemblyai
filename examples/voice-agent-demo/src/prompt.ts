import { DEFAULT_PERSONALITY, type Personality } from './personalities';
import { dateKey, formatLong, relativeLabel, type Dream } from './types';

/** How many recent entries to include in the agent's context. */
const MAX_ENTRIES = 60;

/**
 * Build the Voice Agent system prompt from the journal and the chosen personality.
 *
 * The shared skeleton (who the companion is at the core, and the journal
 * mechanics) is constant; the `personality.persona` block sets the voice and
 * disposition. The whole (recent) journal is embedded inline so the agent can
 * answer any reference — "compare today to yesterday", "what recurring themes
 * show up", "read me last Tuesday's dream" — without a tool round-trip. Each
 * entry is tagged with its date and a relative label so relative asks resolve
 * cleanly.
 */
export function buildJournalSystemPrompt(
  dreams: Dream[],
  personality: Personality = DEFAULT_PERSONALITY
): string {
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
    "You are the user's dream journal. You talk to them by voice about their dreams, and your voice is powered by AssemblyAI (own it if it comes up).",
    `Today is ${formatLong(today)}.`,
    '',
    ...personality.persona,
    '',
    'How you handle the journal (always):',
    '- Keep spoken replies to a sentence or two unless they ask you to go longer.',
    '- When the user references a specific day ("today", "yesterday", a weekday, a date), use the matching entry below. If there is no entry for that day, say so.',
    '- Do NOT fabricate dreams that are not recorded below. Interpret freely; invent entries never.',
    '',
    "The user's recorded dreams (most recent first):",
    entries,
  ].join('\n');
}
