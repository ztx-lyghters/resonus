import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MINI_PLAYER_HEIGHT, spacing, TAB_BAR_HEIGHT } from '@/theme';

/**
 * Bottom space that a list or scroll view must reserve to avoid being covered
 * by the floating MiniPlayer (and, in the tab screens, by the navigation bar).
 *
 * Replaces the fixed SCREEN_BOTTOM_PADDING constant, which ignored the bottom
 * safe area: with 3-button navigation (or large screens/fonts) that inset grows
 * and the MiniPlayer would end up covering the last item.
 *
 * The calculation mirrors the MiniPlayer position in `GlobalMiniPlayer`: above
 * the tab bar when we're in the tabs, and at the bottom everywhere else.
 */
export function useScreenBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const root = segments[0];
  const inTabs = root === '(tabs)' || root === undefined;
  const miniBottom = inTabs ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom + spacing.sm;
  return miniBottom + MINI_PLAYER_HEIGHT + spacing.md;
}
