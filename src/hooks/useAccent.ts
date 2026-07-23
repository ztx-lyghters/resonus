/**
 * Current accent color, reactive. Read it at render time (inline styles) so
 * components re-color themselves when the accent changes in Settings → Theme.
 * (The accent cannot live solely in `colors.accent` because styles from
 * `StyleSheet.create` are frozen at module load time.)
 */
import { useSettings } from '@/store/settings';

export function useAccent(): string {
  return useSettings((s) => s.accentColor);
}
