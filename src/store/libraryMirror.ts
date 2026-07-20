/**
 * Espejo de la biblioteca del servidor para el modo offline.
 *
 * Mientras estás online, cada vez que se ven los favoritos, las listas, un
 * álbum, una lista o un artista, se guarda una copia en disco (por perfil, como
 * el catálogo de descargas). En offline con cuenta de servidor, la pantalla
 * Biblioteca lee de aquí y marca cada canción como disponible (descargada) o no.
 *
 * NO es un espejo de TODA la biblioteca: solo lo favoriteado + las listas, que
 * es lo que muestra la pantalla Biblioteca. Lo que nunca se vio online no estará.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import type { Album, Artist, Playlist, Song, Starred, SubsonicAuth } from '@/api/subsonic';
import { hashKey } from '@/lib/localLibrary';
import { primaryUrl } from '@/lib/serverUrls';
import { useAuthStore } from './auth';

const DIR = FileSystem.documentDirectory + 'library-mirror/';

interface MirrorData {
  starred?: Starred;
  playlists?: Playlist[];
  /** Detalle por id de lista: metadatos + su tracklist completo. */
  playlistTracks?: Record<string, { playlist: Playlist; songs: Song[] }>;
  /** Detalle por id de álbum: metadatos + su tracklist completo. */
  albums?: Record<string, { album: Album; songs: Song[] }>;
  /** Detalle por id de artista: metadatos + sus álbumes. */
  artists?: Record<string, { artist: Artist; albums: Album[] }>;
}

function fileFor(auth: SubsonicAuth): string {
  // URL PRINCIPAL (no la activa): identifica el perfil aunque conmute de red,
  // igual que el directorio de descargas.
  return `${DIR}${hashKey(`${primaryUrl(auth)}|${auth.username}`)}.json`;
}

function activeFile(): string | null {
  const auth = useAuthStore.getState().auth;
  return auth ? fileFor(auth) : null;
}

interface MirrorState {
  data: MirrorData;
  /** Fichero cuyos datos están cargados en memoria (null = ninguno). */
  loadedFile: string | null;
  /** Carga el espejo del perfil activo (si cambió de perfil, recarga). */
  load: () => Promise<void>;
  saveStarred: (s: Starred) => void;
  savePlaylists: (list: Playlist[]) => void;
  savePlaylistDetail: (id: string, playlist: Playlist, songs: Song[]) => void;
  saveAlbum: (id: string, album: Album, songs: Song[]) => void;
  saveArtist: (id: string, artist: Artist, albums: Album[]) => void;
}

let loadingFile: string | null = null;
let loadPromise: Promise<void> | null = null;
// Serializa las escrituras: cada save reescribe el JSON entero.
let writeLock: Promise<unknown> = Promise.resolve();

export const useLibraryMirror = create<MirrorState>((set, get) => {
  function persist() {
    const file = get().loadedFile;
    if (!file) return;
    const data = get().data;
    writeLock = writeLock.then(async () => {
      try {
        await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
        await FileSystem.writeAsStringAsync(file, JSON.stringify(data));
      } catch {
        // Si no se puede persistir, el espejo de esta sesión se pierde al salir.
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
        let data: MirrorData = {};
        try {
          const info = await FileSystem.getInfoAsync(file);
          if (info.exists) {
            data = JSON.parse(await FileSystem.readAsStringAsync(file)) as MirrorData;
          }
        } catch {
          // Fichero corrupto o ausente: espejo vacío.
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
    saveAlbum: (id, album, songs) => {
      set({ data: { ...get().data, albums: { ...get().data.albums, [id]: { album, songs } } } });
      persist();
    },
    saveArtist: (id, artist, albums) => {
      set({ data: { ...get().data, artists: { ...get().data.artists, [id]: { artist, albums } } } });
      persist();
    },
  };
});
