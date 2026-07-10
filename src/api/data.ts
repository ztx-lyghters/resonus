/**
 * Capa de datos unificada. Las pantallas usan estas funciones en lugar de
 * llamar directamente a la API Subsonic. El módulo decide automáticamente
 * si leer del servidor o del catálogo local según el modo (online/offline).
 */
import { useAuthStore } from '@/store/auth';
import {
  enabledFolderIds,
  profileKeyOf,
  readAlbumCache,
  writeAlbumCache,
} from '@/store/libraries';
import * as Subsonic from './backend';
import * as Local from '@/lib/localQueries';

function isOffline() { return useAuthStore.getState().offline; }
function auth() { return useAuthStore.getState().auth!; }

export type { Album, AlbumListType, Artist, ArtistInfo, Playlist, RadioStation, SearchResult, Song, StarType, Starred, SubsonicAuth } from './subsonic';
export { normalizeUrl } from './subsonic';

export function coverArtUrl(id: string | undefined, _size?: number): string | undefined {
  if (isOffline()) return Local.coverUrl(id);
  return Subsonic.coverArtUrl(auth(), id, _size);
}

export function getAlbumList(type: Subsonic.AlbumListType = 'newest', size?: number, offset?: number): Promise<Subsonic.Album[]> {
  if (isOffline()) return Local.getAlbumList(type, size, offset);
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getAlbumList(a, type, size, offset);
  if (ids.length === 1) return Subsonic.getAlbumList(a, type, size, offset, ids[0]);
  return mergedAlbumPage(a, `albums|${type}`, type, ids, size ?? 20, offset ?? 0, (id, s, o) =>
    Subsonic.getAlbumList(a, type, s, o, id),
  );
}

export function getAlbum(id: string): Promise<{ album: Subsonic.Album; songs: Subsonic.Song[] }> {
  if (isOffline()) return Local.getAlbum(id);
  return Subsonic.getAlbum(auth(), id);
}

export function getArtists(): Promise<Subsonic.Artist[]> {
  if (isOffline()) return Local.getArtists();
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getArtists(a);
  if (ids.length === 1) return Subsonic.getArtists(a, ids[0]);
  return Promise.all(ids.map((id) => Subsonic.getArtists(a, id))).then((lists) => {
    const merged = dedupeById(lists.flat());
    merged.sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''));
    return merged;
  });
}

/** Todos los álbumes locales (modo sin conexión). Solo usado offline. */
export function getAllAlbums(): Promise<Subsonic.Album[]> {
  return Local.getAllAlbums();
}

/** Vuelve a escanear el catálogo local (modo sin conexión). */
export function rescanLocal(): Promise<void> {
  return Local.rescan();
}

/** Géneros del servidor (globales; el API no filtra géneros por biblioteca). */
export function getGenres(): Promise<Subsonic.Genre[]> {
  return Subsonic.getGenres(auth());
}

export function getAlbumsByGenre(genre: string, size?: number, offset?: number): Promise<Subsonic.Album[]> {
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getAlbumsByGenre(a, genre, size, offset);
  if (ids.length === 1) return Subsonic.getAlbumsByGenre(a, genre, size, offset, ids[0]);
  return mergedAlbumPage(
    a,
    `byGenre|${genre}`,
    'alphabeticalByName',
    ids,
    size ?? 30,
    offset ?? 0,
    (id, s, o) => Subsonic.getAlbumsByGenre(a, genre, s, o, id),
  );
}

export function getArtist(id: string): Promise<{ artist: Subsonic.Artist; albums: Subsonic.Album[] }> {
  if (isOffline()) return Local.getArtist(id);
  return Subsonic.getArtist(auth(), id);
}

export function getArtistInfo(id: string): Promise<Subsonic.ArtistInfo> {
  if (isOffline()) return Promise.resolve(Local.getArtistInfo(id));
  return Subsonic.getArtistInfo(auth(), id);
}

/** Álbumes donde el artista aparece sin ser el artista del álbum. */
export function getAppearsOn(artistId: string, artistName: string): Promise<Subsonic.Album[]> {
  if (isOffline()) return Local.getAppearsOn(artistId);
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getAppearsOn(a, artistId, artistName);
  if (ids.length === 1) return Subsonic.getAppearsOn(a, artistId, artistName, ids[0]);
  return Promise.all(ids.map((id) => Subsonic.getAppearsOn(a, artistId, artistName, id))).then(
    (lists) => dedupeById(lists.flat()),
  );
}

export function getTopSongs(artist: string, count?: number): Promise<Subsonic.Song[]> {
  if (isOffline()) return Local.getTopSongs(artist, count);
  return Subsonic.getTopSongs(auth(), artist, count);
}

/** Canciones parecidas a una dada (sugerencias). Solo online. */
export function getSimilarSongs(id: string, count?: number): Promise<Subsonic.Song[]> {
  if (isOffline()) return Promise.resolve([]);
  return Subsonic.getSimilarSongs(auth(), id, count);
}

/** Canciones más escuchadas (composición sobre álbumes "frequent" en Subsonic). */
export function getMostPlayedSongs(size = 50): Promise<Subsonic.Song[]> {
  if (isOffline()) return Local.getMostPlayedSongs(size);
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getMostPlayedSongs(a, size);
  if (ids.length === 1) return Subsonic.getMostPlayedSongs(a, size, ids[0]);
  return Promise.all(ids.map((fid) => Subsonic.getMostPlayedSongs(a, size, fid))).then((lists) =>
    dedupeById(lists.flat())
      .sort((x, y) => (y.playCount ?? 0) - (x.playCount ?? 0))
      .slice(0, size),
  );
}

export function getPlaylists(): Promise<Subsonic.Playlist[]> {
  if (isOffline()) return Local.getPlaylists();
  return Subsonic.getPlaylists(auth());
}

export function getStarred(): Promise<Subsonic.Starred> {
  if (isOffline()) return Local.getStarred();
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getStarred(a);
  if (ids.length === 1) return Subsonic.getStarred(a, ids[0]);
  return Promise.all(ids.map((id) => Subsonic.getStarred(a, id))).then((parts) => ({
    songs: dedupeById(parts.flatMap((p) => p.songs)),
    albums: dedupeById(parts.flatMap((p) => p.albums)),
    artists: dedupeById(parts.flatMap((p) => p.artists)),
  }));
}

export function star(id: string, type?: Subsonic.StarType): Promise<void> {
  if (isOffline()) return Local.starLocal(id, type);
  return Subsonic.star(auth(), id, type);
}

export function unstar(id: string, type?: Subsonic.StarType): Promise<void> {
  if (isOffline()) return Local.unstarLocal(id, type);
  return Subsonic.unstar(auth(), id, type);
}

/** Valora una canción (1-5; 0 quita la valoración). Solo online. */
export function setRating(id: string, rating: number): Promise<void> {
  if (isOffline()) return Promise.resolve();
  return Subsonic.setRating(auth(), id, rating);
}

export function search(query: string): Promise<Subsonic.SearchResult> {
  if (isOffline()) return Local.search(query);
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.search(a, query);
  if (ids.length === 1) return Subsonic.search(a, query, ids[0]);
  return Promise.all(ids.map((id) => Subsonic.search(a, query, id))).then((parts) => ({
    artists: dedupeById(parts.flatMap((p) => p.artists)),
    albums: dedupeById(parts.flatMap((p) => p.albums)),
    songs: dedupeById(parts.flatMap((p) => p.songs)),
  }));
}

export function scrobble(id: string): Promise<void> {
  if (isOffline()) return Promise.resolve();
  return Subsonic.scrobble(auth(), id);
}

export function addToPlaylist(playlistId: string, songId: string): Promise<void> {
  if (isOffline()) return Local.addToPlaylist(playlistId, songId);
  return Subsonic.addToPlaylist(auth(), playlistId, songId);
}

/** Crea una playlist vacía y devuelve su id. */
export function createPlaylist(name: string): Promise<string> {
  if (isOffline()) return Local.createPlaylist(name);
  return Subsonic.createPlaylist(auth(), name);
}

export function deletePlaylist(id: string): Promise<void> {
  if (isOffline()) return Local.deletePlaylist(id);
  return Subsonic.deletePlaylist(auth(), id);
}

export function getPlaylist(id: string): Promise<{ playlist: Subsonic.Playlist; songs: Subsonic.Song[] }> {
  if (isOffline()) return Local.getPlaylist(id);
  return Subsonic.getPlaylist(auth(), id);
}

export function updatePlaylist(
  id: string,
  changes: { name?: string; comment?: string; public?: boolean },
): Promise<void> {
  if (isOffline()) return Local.updatePlaylist(id, changes);
  return Subsonic.updatePlaylist(auth(), id, changes);
}

export function removeFromPlaylist(id: string, index: number): Promise<void> {
  if (isOffline()) return Local.removeFromPlaylist(id, index);
  return Subsonic.removeFromPlaylist(auth(), id, index);
}

// ── Fusión de varias bibliotecas (modo subconjunto) ──
//
// El API Subsonic solo filtra por una biblioteca por petición, así que cuando
// hay varias activas se consulta cada una y se fusionan los resultados aquí.

/** Quita duplicados por id conservando el primero visto. */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/** Trae la lista completa de álbumes paginando hasta el final. */
async function fetchAllAlbums(
  fetchPage: (size: number, offset: number) => Promise<Subsonic.Album[]>,
): Promise<Subsonic.Album[]> {
  const PAGE = 500;
  const out: Subsonic.Album[] = [];
  for (let offset = 0; offset <= 20000; offset += PAGE) {
    const chunk = await fetchPage(PAGE, offset);
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

/**
 * Fusiona las listas por-biblioteca (cada una ya ordenada por el servidor según
 * `type`). Cuando hay clave de orden disponible en el álbum (nombre, artista,
 * favorito) se reordena de verdad; para el resto (recientes/añadidos/frecuentes,
 * cuyos campos no vienen en el álbum) se intercalan en round-robin para no
 * amontonar una biblioteca antes que otra.
 */
function mergeAlbums(perFolder: Subsonic.Album[][], type: Subsonic.AlbumListType): Subsonic.Album[] {
  if (type === 'alphabeticalByName') {
    return dedupeById(perFolder.flat()).sort((a, b) => a.name.localeCompare(b.name));
  }
  if (type === 'alphabeticalByArtist') {
    return dedupeById(perFolder.flat()).sort(
      (a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || a.name.localeCompare(b.name),
    );
  }
  if (type === 'starred') {
    return dedupeById(perFolder.flat()).sort((a, b) => (b.starred ?? '').localeCompare(a.starred ?? ''));
  }
  // Intercalado round-robin conservando el orden interno de cada biblioteca.
  const interleaved: Subsonic.Album[] = [];
  const max = Math.max(0, ...perFolder.map((f) => f.length));
  for (let i = 0; i < max; i++) {
    for (const folder of perFolder) {
      if (folder[i]) interleaved.push(folder[i]);
    }
  }
  return dedupeById(interleaved);
}

/**
 * Sirve una página de la lista fusionada de varias bibliotecas. La lista
 * completa se cachea un rato para no rehacer el trabajo en cada página del
 * scroll infinito.
 */
async function mergedAlbumPage(
  a: Subsonic.SubsonicAuth,
  cacheBase: string,
  type: Subsonic.AlbumListType,
  ids: string[],
  size: number,
  offset: number,
  fetchOne: (id: string, size: number, offset: number) => Promise<Subsonic.Album[]>,
): Promise<Subsonic.Album[]> {
  const cacheKey = `${cacheBase}|${profileKeyOf(a)}|${ids.join(',')}`;
  let all = readAlbumCache<Subsonic.Album>(cacheKey);
  if (!all) {
    const perFolder = await Promise.all(ids.map((id) => fetchAllAlbums((s, o) => fetchOne(id, s, o))));
    all = mergeAlbums(perFolder, type);
    writeAlbumCache(cacheKey, all);
  }
  return all.slice(offset, offset + size);
}
