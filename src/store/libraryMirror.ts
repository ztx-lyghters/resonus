/**
 * Server library mirror for offline mode.
 *
 * While online, every time favorites, playlists, an album, a playlist or an
 * artist are viewed, a copy is saved to disk (per profile, like the download
 * catalog). Offline with a server account, the Library screen reads from here
 * and marks each song as available (downloaded) or not.
 *
 * It is NOT a mirror of the ENTIRE library: only favorited items + playlists,
 * which is what the Library screen shows. What was never seen online won't be
 * there.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { Album, Artist, Playlist, Song, Starred, SubsonicAuth } from '@/api/subsonic';
import { hashKey } from '@/lib/localLibrary';
import { primaryUrl } from '@/lib/serverUrls';
import { useAuthStore } from './auth';

const DIR = FileSystem.documentDirectory + 'library-mirror/';

interface MirrorData {
  starred?: Starred;
  playlists?: Playlist[];
  /** Detail per playlist id: metadata + its complete tracklist. */
  playlistTracks?: Record<string, { playlist: Playlist; songs: Song[] }>;
  /** Detail per album id: metadata + its complete tracklist. */
  albums?: Record<string, { album: Album; songs: Song[] }>;
  /** Detail per artist id: metadata + its albums. */
  artists?: Record<string, { artist: Artist; albums: Album[] }>;
}

function fileFor(auth: SubsonicAuth): string {
  // PRIMARY URL (not the active one): identifies the profile even when switching
  // networks, same as the download directory.
  return `${DIR}${hashKey(`${primaryUrl(auth)}|${auth.username}`)}.json`;
}

function activeFile(): string | null {
  const auth = useAuthStore.getState().auth;
  return auth ? fileFor(auth) : null;
}

interface MirrorState {
  data: MirrorData;
  /** File whose data is loaded in memory (null = none). */
  loadedFile: string | null;
  /** Loads the active profile's mirror (if profile changed, reloads). */
  load: () => Promise<void>;
  saveStarred: (s: Starred) => void;
  savePlaylists: (list: Playlist[]) => void;
  savePlaylistDetail: (id: string, playlist: Playlist, songs: Song[]) => void;
  /** Saves multiple details at once (single disk write). */
  savePlaylistDetails: (entries: { id: string; playlist: Playlist; songs: Song[] }[]) => void;
  saveAlbum: (id: string, album: Album, songs: Song[]) => void;
  saveArtist: (id: string, artist: Artist, albums: Album[]) => void;
  /** Forces pending writes to disk immediately (on background/offline). */
  flush: () => void;
}

let loadingFile: string | null = null;
let loadPromise: Promise<void> | null = null;
// Serializes writes: each save rewrites the entire JSON.
let writeLock: Promise<unknown> = Promise.resolve();
// Saving rewrites the ENTIRE JSON with `JSON.stringify` (synchronous, blocks
// the JS thread), and the mirror grows with use (each viewed album/playlist).
// Before, it was written on EVERY navigation → opening an album or going offline
// would freeze the UI, worse the larger the library. Now it accumulates (`dirty`)
// and flushes ONCE after a calm period, or immediately on background/offline.
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
const PERSIST_DEBOUNCE_MS = 4000;

export const useLibraryMirror = create<MirrorState>((set, get) => {
  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!dirty) return;
    dirty = false;
    const file = get().loadedFile;
    if (!file) return;
    const data = get().data;
    writeLock = writeLock.then(async () => {
      try {
        await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
        await FileSystem.writeAsStringAsync(file, JSON.stringify(data));
      } catch {
        // If it can't be persisted, this session's mirror is lost on exit.
      }
    });
  }

  function persist() {
    if (!get().loadedFile) return;
    dirty = true;
    if (!flushTimer) flushTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  }

  return {
    data: {},
    loadedFile: null,

    load: async () => {
      const file = activeFile();
      if (!file) {
        if (get().loadedFile !== null) {
          flush(); // flushes pending writes for the profile being closed
          set({ data: {}, loadedFile: null });
        }
        return;
      }
      if (get().loadedFile === file) return;
      flush(); // profile switch: persist pending from previous before loading
      if (loadPromise && loadingFile === file) return loadPromise;
      loadingFile = file;
      loadPromise = (async () => {
        let data: MirrorData = {};
        try {
          const info = await FileSystem.getInfoAsync(file);
          if (info.exists) {
            data = JSON.parse(await FileSystem.readAsStringAsync(file)) as MirrorData;
          }
        } catch {
          // Corrupt or missing file: empty mirror.
        }
        set({ data, loadedFile: file });
      })().finally(() => {
        loadPromise = null;
        loadingFile = null;
      });
      return loadPromise;
    },

    saveStarred: (starred) => {
      set({ data: { ...get().data, starred } });
      persist();
    },
    savePlaylists: (playlists) => {
      set({ data: { ...get().data, playlists } });
      persist();
    },
    savePlaylistDetail: (id, playlist, songs) => {
      set({
        data: {
          ...get().data,
          playlistTracks: { ...get().data.playlistTracks, [id]: { playlist, songs } },
        },
      });
      persist();
    },
    savePlaylistDetails: (entries) => {
      if (entries.length === 0) return;
      const next = { ...get().data.playlistTracks };
      for (const e of entries) next[e.id] = { playlist: e.playlist, songs: e.songs };
      set({ data: { ...get().data, playlistTracks: next } });
      persist();
    },
    saveAlbum: (id, album, songs) => {
      set({ data: { ...get().data, albums: { ...get().data.albums, [id]: { album, songs } } } });
      persist();
    },
    saveArtist: (id, artist, albums) => {
      set({ data: { ...get().data, artists: { ...get().data.artists, [id]: { artist, albums } } } });
      persist();
    },
    flush,
  };
});

// On background (or close), flush pending writes immediately: the debounce
// might not have fired and we'd lose the last changes if the app is killed.
AppState.addEventListener('change', (s) => {
  if (s !== 'active') useLibraryMirror.getState().flush();
});
