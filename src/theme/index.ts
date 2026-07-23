/**
 * Resonus visual theme. Dark, Spotify-like aesthetic; the only customizable
 * color is the accent (selectable in Settings → Theme). The accent is hot-
 * swapped via `applyAccent`; inline usages pick it up on re-render.
 */

/** Default accent (Spotify green). */
export const DEFAULT_ACCENT = '#1DB954';

export const colors = {
  background: '#121212',
  surface: '#181818',
  surfaceHighlight: '#282828',
  border: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textMuted: '#727272',
  accent: DEFAULT_ACCENT,
  accentPressed: '#1AA34A',
  danger: '#E03131',
  // "Success" state green (independent of the configurable accent).
  success: '#2F9E44',
};

/** Darkens a hex color (~14% by default) for the "pressed" state. */
function darken(hex: string, amount = 0.14): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (c: number) => Math.round(c * (1 - amount));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  const to = (x: number) => x.toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Hot-swaps the accent (accent + its "pressed" variant). */
export function applyAccent(hex: string): void {
  colors.accent = hex;
  colors.accentPressed = darken(hex);
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/** Height of the tab bar (not including the bottom safe area). */
export const TAB_BAR_HEIGHT = 60;

/** Approximate height of the floating MiniPlayer (44px artwork + padding). */
export const MINI_PLAYER_HEIGHT = 60;

/**
 * Fixed bottom spacing for screen lists WITHOUT a tab bar: the MiniPlayer
 * floats at the bottom and this gap clears it with extra margin.
 *
 * On tab screens (Home, Search, Library) the MiniPlayer stacks on top of the
 * tab bar, so they additionally need the actual bottom safe area (which varies
 * between gesture nav vs. 3-button nav); those screens use
 * `useScreenBottomPadding()`, not this constant.
 */
export const SCREEN_BOTTOM_PADDING = 140;
