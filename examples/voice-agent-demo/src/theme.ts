/**
 * Nocturne design tokens — a quiet, nocturnal palette.
 * One accent (periwinkle) for interaction, one warm gold for the companion's
 * voice, everything else in deep indigo neutrals.
 */
export const theme = {
  colors: {
    background: '#0B0D16',
    surface: '#121524',
    surfaceRaised: '#1A1E33',
    border: '#272C47',
    accent: '#9B96F8',
    accentSoft: 'rgba(155,150,248,0.14)',
    gold: '#E3C08D',
    goldSoft: 'rgba(227,192,141,0.14)',
    ink: '#0B0D16',
    text: '#ECEEF8',
    textMuted: '#8A8FAB',
    textFaint: '#4E5372',
    success: '#7BD8B0',
    danger: '#F0708A',
  },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  spacing: (n: number) => n * 8,
} as const;
