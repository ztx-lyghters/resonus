import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MINI_PLAYER_HEIGHT, spacing, TAB_BAR_HEIGHT } from '@/theme';

/**
 * Espacio inferior que una lista o scroll debe reservar para no quedar tapada
 * por el MiniPlayer flotante (y, en las pestañas, por la barra de navegación).
 *
 * Sustituye a la constante fija SCREEN_BOTTOM_PADDING, que ignoraba el
 * safe-area inferior: con navegación por 3 botones (o pantallas/fuentes
 * grandes) ese inset crece y el MiniPlayer acababa tapando el último elemento.
 *
 * El cálculo replica la posición del MiniPlayer en `GlobalMiniPlayer`: encima
 * de la barra de pestañas cuando estamos en ellas, y al fondo en el resto.
 */
export function useScreenBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const root = segments[0];
  const inTabs = root === '(tabs)' || root === undefined;
  const miniBottom = inTabs ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom + spacing.sm;
  return miniBottom + MINI_PLAYER_HEIGHT + spacing.md;
}
