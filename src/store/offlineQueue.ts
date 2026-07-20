/**
 * Cola de acciones offline (outbox) por perfil de servidor.
 *
 * Con cuenta de servidor en modo offline, las mutaciones (marcar favorito,
 * puntuar, editar listas…) no llegan al servidor: se apuntan aquí, se reflejan
 * al momento sobre el espejo de biblioteca, y al volver online se vuelcan al
 * servidor (ver auth.goOnline). El perfil local (sin cuenta) no usa esta cola.
 *
 * Fases: favoritos y valoraciones. Las listas se añaden en una fase siguiente.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import type { Song, StarType, SubsonicAuth } from '@/api/subsonic';
import { hashKey } from '@/lib/localLibrary';
import { primaryUrl } from '@/lib/serverUrls';
import { useAuthStore } from './auth';

const DIR = FileSystem.documentDirectory + 'offline-queue/';

/** Estado deseado de un favorito (last-write-wins por id). */
interface FavOp {
  type: StarType;
  starred: boolean;
}

/**
 * Estado deseado de una lista tras las ediciones offline. En vez de un log de
 * add/remove/reorder, guardamos el resultado final (Subsonic reescribe la lista
 * entera con `reorderPlaylist`, así evitamos el lío de índices al sincronizar).
 * La clave puede ser el id del servidor o un id temporal `tmp_…` (lista creada
 * offline, que recibe su id real al sincronizar).
 */
interface QueuePlaylist {
  /** Lista creada offline (la clave es un id temporal). */
  created?: boolean;
  /** Marcada para borrar. */
  deleted?: boolean;
  name?: string;
  comment?: string;
  public?: boolean;
  /** Tracklist final deseado (ids de canción); undefined = sin cambios. */
  songIds?: string[];
}

interface QueueData {
  /** id → estado deseado del favorito. */
  favs?: Record<string, FavOp>;
  /** id de canción → valoración deseada (1-5; 0 = sin valorar). */
  ratings?: Record<string, number>;
  /** id de lista (servidor o `tmp_…`) → estado deseado tras editarla offline. */
  playlists?: Record<string, QueuePlaylist>;
  /** Metadatos de canciones añadidas offline, para mostrarlas en las listas. */
  songMeta?: Record<string, Song>;
}

export type { QueuePlaylist };

function fileFor(auth: SubsonicAuth): string {
  return `${DIR}${hashKey(`${primaryUrl(auth)}|${auth.username}`)}.json`;
}

function activeFile(): string | null {
  const auth = useAuthStore.getState().auth;
  return auth ? fileFor(auth) : null;
}

interface QueueState {
  data: QueueData;
  loadedFile: string | null;
  load: () => Promise<void>;
  /** Registra el estado deseado de un favorito (offline). */
  setFav: (id: string, type: StarType, starred: boolean) => void;
  /** Vacía la cola de favoritos (tras volcarla al servidor). */
  clearFavs: () => void;
  /** Registra la valoración deseada de una canción (offline). */
  setRating: (id: string, rating: number) => void;
  /** Vacía la cola de valoraciones (tras volcarla al servidor). */
  clearRatings: () => void;
  /** Fusiona cambios en el estado deseado de una lista. */
  setPlaylist: (id: string, patch: Partial<QueuePlaylist>) => void;
  /** Elimina la entrada de una lista de la cola (creada-y-borrada, o tras sync). */
  removePlaylistEntry: (id: string) => void;
  /** Guarda metadatos de canciones para poder mostrarlas al editar listas offline. */
  rememberSongs: (songs: Song[]) => void;
  /** Vacía las ediciones de listas (tras volcarlas al servidor). */
  clearPlaylists: () => void;
  /** ¿Hay algo pendiente de sincronizar? */
  isEmpty: () => boolean;
}

let loadingFile: string | null = null;
let loadPromise: Promise<void> | null = null;
let writeLock: Promise<unknown> = Promise.resolve();

export const useOfflineQueue = create<QueueState>((set, get) => {
  function persist() {
    const file = get().loadedFile;
    if (!file) return;
    const data = get().data;
    writeLock = writeLock.then(async () => {
      try {
        await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
        await FileSystem.writeAsStringAsync(file, JSON.stringify(data));
      } catch {
        // Si no se puede persistir, la cola de esta sesión se pierde al salir.
      }
    });
  }

  return {
    data: {},
    loadedFile: null,

    load: async () => {
      const file = activeFile();
      if (!file) {
        if (get().loadedFile !== null) set({ data: {}, loadedFile: null });
        return;
      }
      if (get().loadedFile === file) return;
      if (loadPromise && loadingFile === file) return loadPromise;
      loadingFile = file;
      loadPromise = (async () => {
        let data: QueueData = {};
        try {
          const info = await FileSystem.getInfoAsync(file);
          if (info.exists) data = JSON.parse(await FileSystem.readAsStringAsync(file)) as QueueData;
        } catch {
          // Fichero corrupto o ausente: cola vacía.
        }
        set({ data, loadedFile: file });
      })().finally(() => {
        loadPromise = null;
        loadingFile = null;
      });
      return loadPromise;
    },

    setFav: (id, type, starred) => {
      set({ data: { ...get().data, favs: { ...get().data.favs, [id]: { type, starred } } } });
      persist();
    },

    clearFavs: () => {
      const { favs, ...rest } = get().data;
      void favs;
      set({ data: rest });
      persist();
    },

    setRating: (id, rating) => {
      set({ data: { ...get().data, ratings: { ...get().data.ratings, [id]: rating } } });
      persist();
    },

    clearRatings: () => {
      const { ratings, ...rest } = get().data;
      void ratings;
      set({ data: rest });
      persist();
    },

    setPlaylist: (id, patch) => {
      const cur = get().data.playlists?.[id] ?? {};
      set({ data: { ...get().data, playlists: { ...get().data.playlists, [id]: { ...cur, ...patch } } } });
      persist();
    },

    removePlaylistEntry: (id) => {
      const playlists = { ...get().data.playlists };
      delete playlists[id];
      set({ data: { ...get().data, playlists } });
      persist();
    },

    rememberSongs: (songs) => {
      const songMeta = { ...get().data.songMeta };
      for (const s of songs) songMeta[s.id] = s;
      set({ data: { ...get().data, songMeta } });
      persist();
    },

    clearPlaylists: () => {
      const { playlists, songMeta, ...rest } = get().data;
      void playlists;
      void songMeta;
      set({ data: rest });
      persist();
    },

    isEmpty: () => {
      const d = get().data;
      return (
        (!d.favs || Object.keys(d.favs).length === 0) &&
        (!d.ratings || Object.keys(d.ratings).length === 0) &&
        (!d.playlists || Object.keys(d.playlists).length === 0)
      );
    },
  };
});
