/**
 * Reescribe los deep links del sistema antes de que expo-router los resuelva.
 *
 * react-native-track-player opens the app, on notification tap, with the
 * enlace `trackplayer://notification.click` (y `trackplayer://service-bound`
 * when binding the service). Those routes don't exist and would show "Unmatched
 * Route", so the notification tap is routed to the player.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (path.includes('notification.click')) return '/player';
    // Other internal RNTP intents: to the main screen instead of failing.
    if (path.includes('trackplayer://')) return '/';
    return path;
  } catch {
    return '/';
  }
}
