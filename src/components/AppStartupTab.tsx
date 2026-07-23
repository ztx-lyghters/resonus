/**
 * Startup tab + reset on reopen.
 *
 * - On cold start, if the default tab is not Home, jump to it.
 * - On returning from background after a while (RESET_AFTER_MS), dismiss any
 *   stacked screens and go back to the default tab (like Spotify/YouTube).
 *   A brief app switch preserves where you were.
 *
 * Renders nothing; only orchestrates navigation. Mounted with an active session.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAutoDownloads } from '@/store/autoDownloads';
import { useSettings, type DefaultTab } from '@/store/settings';

const TAB_HREF: Record<DefaultTab, '/' | '/search' | '/library'> = {
  index: '/',
  search: '/search',
  library: '/library',
};

// Time in background after which, on return, the app opens on the default
// tab. Below this (quick app switch) the current screen is preserved.
const RESET_AFTER_MS = 3 * 60 * 1000;

export function AppStartupTab() {
  const router = useRouter();
  const defaultTab = useSettings((s) => s.defaultTab);
  const backgroundedAt = useRef<number | null>(null);
  const didInitial = useRef(false);

  const goToDefaultTab = () => {
    // Dismiss whatever was stacked on top of the tabs (album, settings,
    // player…) and activate the default tab.
    if (router.canDismiss()) router.dismissAll();
    router.navigate(TAB_HREF[defaultTab]);
  };

  // Cold start: if the default tab is not Home, jump to it.
  useEffect(() => {
    if (didInitial.current) return;
    didInitial.current = true;
    if (defaultTab !== 'index') goToDefaultTab();
    // On mount only; the value lives in the guard ref.
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
        // On return, sync auto-download playlists (catch what was added from
        // another client while the app was in the background).
        void useAutoDownloads.getState().reconcileAll();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab]);

  return null;
}
