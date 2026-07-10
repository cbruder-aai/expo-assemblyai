/** AssemblyAI brand palette (matches the Blurt app's badges and site). */
export const theme = {
  colors: {
    background: '#0b0b12',
    surface: '#15151f',
    surfaceRaised: '#1e1e2b',
    border: '#2a2a3a',
    pink: '#f32a91',
    cyan: '#00d8ef',
    text: '#f5f5fa',
    textMuted: '#9a9ab0',
    success: '#3ddc97',
    danger: '#ff5c72',
  },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  spacing: (n: number) => n * 8,
} as const;
