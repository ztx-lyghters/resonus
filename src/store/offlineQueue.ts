/**
 * Offline action queue (outbox) per server profile.
 *
 * With a server account in offline mode, mutations (favorite, rate, edit
 * playlists…) don't reach the server: they are recorded here, reflected
 * immediately on the library mirror, and flushed to the server when going back
 * online (see auth.goOnline). The local profile (no account) doesn't use this
 * queue.
 *
 * Phases: favorites and ratings. Playlists are added in a subsequent phase.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import type { Song, StarType, SubsonicAuth } from '@/api/subsonic';
import { hashKey } from '@/lib/localLibrary';
import { primaryUrl } from '@/lib/serverUrls';
import { useAuthStore } from './auth';

const DIR = FileSystem.documentDirectory + 'offline-queue/';

/** Desired state of a favorite (last-write-wins by id). */
interface FavOp {
  type: StarType;
  starred: boolean;
}

/**
 * Desired state of a playlist after offline edits. Instead of a log of
 * add/remove/reorder, we store the final result (Subsonic rewrites the entire
 * playlist with `reorderPlaylist`, avoiding the mess of indices on sync). The
 * key can be a server id or a temporary id `tmp_…` (playlist created offline,
 * which gets its real id on sync).
 */
interface QueuePlaylist {
  /** Playlist created offline (key is a temporary id). */
  created?: boolean;
  /** Marked for deletion. */
  deleted?: boolean;
  name?: string;
  comment?: string;
  public?: boolean;
  /** Desired final tracklist (song ids); undefined = no change. */
  songIds?: string[];
}

interface QueueData {
  /** id → desired favorite state. */
  favs?: Record<string, FavOp>;
  /** Song id → desired rating (1-5; 0 = unrated). */
  ratings?: Record<string, number>;
  /** Playlist id (server or `tmp_…`) → desired state after editing it offline. */
  playlists?: Record<string, QueuePlaylist>;
  /** Metadata for songs added offline, to show them in playlists. */
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
  /** Records the desired state of a favorite (offline). */
  setFav: (id: string, type: StarType, starred: boolean) => void;
  /** Clears the favorites queue (after flushing to server). */
  clearFavs: () => void;
  /** Records the desired rating for a song (offline). */
  setRating: (id: string, rating: number) => void;
  /** Clears the ratings queue (after flushing to server). */
  clearRatings: () => void;
  /** Merges changes into the desired state of a playlist. */
  setPlaylist: (id: string, patch: Partial<QueuePlaylist>) => void;
  /** Removes a playlist's queue entry (created-and-deleted, or after sync). */
  removePlaylistEntry: (id: string) => void;
  /** Stores song metadata to display them when editing playlists offline. */
  rememberSongs: (songs: Song[]) => void;
  /** Clears playlist edits (after flushing to server). */
  clearPlaylists: () => void;
  /** Is there anything pending to sync? */
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
        // If it can't be persisted, this session's queue is lost on exit.
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
          // Corrupt or missing file: empty queue.
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
