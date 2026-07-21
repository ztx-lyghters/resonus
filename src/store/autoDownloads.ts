/**
 * Playlists marcadas para DESCARGA AUTOMÁTICA (por perfil). Al activar una, se
 * descargan sus canciones y, cada vez que se refresca (al abrirla, al añadir una
 * canción desde la app, o al volver la app a primer plano), se descargan las que
 * falten.
 *
 * v1: solo AÑADE. Quitar una canción de la lista no borra su fichero (podría
 * estar en otra descarga; el borrado con recuento de referencias queda para más
 * adelante). Desactivar el toggle tampoco borra nada: solo deja de sincronizar.
 *
 * Reusa `downloadPlaylist`, que ya es idempotente (salta lo descargado, respeta
 * calidad/códec/solo-Wi-Fi) y refresca la playlist local `dl_<id>` con la nueva
 * composición, así que reconciliar es: pedir el tracklist actual + descargarlo.
 */
import { create } from 'zustand';

import { getPlaylist } from '@/api/data';
import { type Playlist, type Song } from '@/api/subsonic';
import { hashKey } from '@/lib/localLibrary';
import { getItem, setItem } from '@/lib/storage';
import { profileScopeId, useAuthStore } from '@/store/auth';
import { useDownloads } from '@/store/downloads';
import { useNetworkType } from '@/store/networkType';
import { useSettings } from '@/store/settings';

// Por perfil: cada cuenta guarda sus playlists auto-descarga bajo
// `resonus.autodl.<hash del perfil>`.
const KEY = 'resonus.autodl';
function storeKey(): string {
  return `${KEY}.${hashKey(profileScopeId())}`;
}

/**
 * ¿Se puede reconciliar ahora? Sin conexión o sin cuenta, no. En segundo plano
 * (foreground/apertura/añadir) no molestamos con el toast de Wi-Fi: si el modo
 * "solo Wi-Fi" está activo y hay datos móviles, se deja para el próximo intento.
 */
function canRun(background: boolean): boolean {
  const { offline, auth } = useAuthStore.getState();
  if (offline || !auth) return false;
  if (background && useSettings.getState().downloadWifiOnly && useNetworkType.getState().cellular) {
    return false;
  }
  return true;
}

interface AutoDownloadsState {
  /** id de playlist (de servidor) → marcada para auto-descarga. */
  ids: Record<string, true>;
  /** Activa/desactiva el flag (no reconcilia; quien llama decide con qué datos). */
  toggle: (playlistId: string) => void;
  /** Reconcilia pidiendo el tracklist actual al servidor. */
  reconcile: (playlistId: string, background?: boolean) => Promise<void>;
  /** Reconcilia con un tracklist ya en mano (evita re-pedirlo al servidor). */
  reconcileKnown: (playlist: Playlist, songs: Song[], background?: boolean) => Promise<void>;
  /** Reconcilia todas las marcadas (al volver a primer plano). */
  reconcileAll: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAutoDownloads = create<AutoDownloadsState>((set, get) => ({
  ids: {},

  toggle: (playlistId) => {
    const ids = { ...get().ids };
    if (ids[playlistId]) delete ids[playlistId];
    else ids[playlistId] = true;
    set({ ids });
    void setItem(storeKey(), JSON.stringify(ids));
  },

  reconcile: async (playlistId, background = false) => {
    if (!get().ids[playlistId] || !canRun(background)) return;
    try {
      const { playlist, songs } = await getPlaylist(playlistId);
      await useDownloads.getState().downloadPlaylist(playlist, songs);
    } catch {
      // Red caída u otra: se reintenta en el próximo disparo.
    }
  },

  reconcileKnown: async (playlist, songs, background = false) => {
    if (!get().ids[playlist.id] || !canRun(background)) return;
    try {
      await useDownloads.getState().downloadPlaylist(playlist, songs);
    } catch {
      // idem: sin ruido, se reintenta.
    }
  },

  reconcileAll: async () => {
    // Secuencial a propósito: no saturar red/disco arrancando todas a la vez.
    for (const id of Object.keys(get().ids)) {
      await get().reconcile(id, true);
    }
  },

  hydrate: async () => {
    // Se re-ejecuta al cambiar de perfil: RESETEAR a {} si el nuevo no tiene, o
    // quedarían en memoria las del perfil anterior.
    try {
      const raw = await getItem(storeKey());
      set({ ids: raw ? (JSON.parse(raw) as Record<string, true>) : {} });
    } catch {
      set({ ids: {} });
    }
  },
}));
