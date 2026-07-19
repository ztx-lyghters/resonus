/**
 * Pestaña de arranque + reset al reabrir.
 *
 * - Al abrir la app en frío, si la pestaña por defecto no es Inicio, salta a ella.
 * - Al volver del segundo plano tras un rato (RESET_AFTER_MS), cierra cualquier
 *   pantalla apilada y vuelve a la pestaña por defecto (como Spotify/YouTube).
 *   Un cambio de app breve conserva dónde estabas.
 *
 * No pinta nada; solo orquesta navegación. Se monta con sesión activa.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useSettings, type DefaultTab } from '@/store/settings';

const TAB_HREF: Record<DefaultTab, '/' | '/search' | '/library'> = {
  index: '/',
  search: '/search',
  library: '/library',
};

// Tiempo en segundo plano a partir del cual, al volver, se abre en la pestaña
// por defecto. Por debajo (cambio de app rápido) se conserva la pantalla actual.
const RESET_AFTER_MS = 3 * 60 * 1000;

export function AppStartupTab() {
  const router = useRouter();
  const defaultTab = useSettings((s) => s.defaultTab);
  const backgroundedAt = useRef<number | null>(null);
  const didInitial = useRef(false);

  const goToDefaultTab = () => {
    // Cierra lo que hubiera apilado encima de las pestañas (álbum, ajustes,
    // player…) y activa la pestaña por defecto.
    if (router.canDismiss()) router.dismissAll();
    router.navigate(TAB_HREF[defaultTab]);
  };

  // Arranque en frío: si la pestaña por defecto no es Inicio, saltamos a ella.
  useEffect(() => {
    if (didInitial.current) return;
    didInitial.current = true;
    if (defaultTab !== 'index') goToDefaultTab();
    // Solo al montar; el valor vive en la ref del guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since !== null && Date.now() - since > RESET_AFTER_MS) goToDefaultTab();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab]);

  return null;
}
