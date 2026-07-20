/**
 * Capa de datos unificada. Las pantallas usan estas funciones en lugar de
 * llamar directamente a la API Subsonic. El módulo decide automáticamente
 * si leer del servidor o del catálogo local según el modo (online/offline).
 */
import { useAuthStore } from '@/store/auth';
import { getDownloadsCatalog, useDownloads } from '@/store/downloads';
import {
  enabledFolderIds,
  profileKeyOf,
  readAlbumCache,
  writeAlbumCache,
} from '@/store/libraries';
import { useLibraryMirror } from '@/store/libraryMirror';
import * as Subsonic from './backend';
import * as Local from '@/lib/localQueries';
import type { Song } from './subsonic';

function isOffline() { return useAuthStore.getState().offline; }
function auth() { return useAuthStore.getState().auth!; }

/** Modo offline CON cuenta de servidor (no el perfil local de solo-ficheros):
 *  aquí la Biblioteca es un espejo del servidor (ver store/libraryMirror). */
function serverOffline(): boolean {
  const s = useAuthStore.getState();
  return s.offline && !!s.auth;
}

/**
 * Marca cada canción del espejo como disponible o no según las descargas: las
 * descargadas reciben su `localUri` (se reproducen desde disco); el resto quedan
 * `unavailable` (se pintan en gris y no suenan). En offline el conjunto de
 * descargas no cambia, así que la marca es estable durante la sesión.
 *
 * Carátulas: la descargada re-clava `coverArt` a `albumId` (el índice local va
 * por albumId). La NO descargada conserva el `coverArt` del servidor, para que
 * la URL offline coincida con la de online y expo-image la sirva de su caché
 * (o la baje si el offline es manual con red); si no, queda el placeholder.
 */
function annotate(songs: Song[]): Song[] {
  const files = useDownloads.getState().files;
  return songs.map((s) => {
    const uri = files[s.id];
    return uri
      ? { ...s, coverArt: s.albumId ?? s.coverArt, localUri: uri, unavailable: false }
      : { ...s, unavailable: true };
  });
}

/** Carga el espejo del perfil y registra en el índice local las carátulas de las
 *  descargas (sin esto, las carátulas offline no aparecen). */
async function loadMirror(): Promise<void> {
  await Promise.all([useLibraryMirror.getState().load(), getDownloadsCatalog()]);
}

export type { Album, AlbumListType, Artist, ArtistInfo, FolderContents, FolderEntry, MusicFolder, Playlist, RadioStation, SearchResult, Song, StarType, Starred, SubsonicAuth } from './subsonic';
export { normalizeUrl } from './subsonic';

export function coverArtUrl(id: string | undefined, _size?: number): string | undefined {
  // Si la carátula está descargada (álbum/artista en disco), úsala aunque
  // estemos en modo servidor: funciona sin conexión y no gasta datos, igual
  // que el audio suena desde el fichero descargado.
  const local = Local.coverUrl(id);
  if (local) return local;
  if (isOffline()) {
    // Offline de servidor: la URL del servidor como respaldo. expo-image la sirve
    // de su caché si ya se vio online (o la baja si el offline es manual con red);
    // si no, queda el placeholder. Así las canciones/álbumes no descargados
    // enseñan carátula aunque no se puedan reproducir. El perfil local (sin
    // cuenta) no tiene servidor, así que ahí no hay respaldo.
    return serverOffline() ? Subsonic.coverArtUrl(auth(), id, _size) : undefined;
  }
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
  if (isOffline()) {
    if (serverOffline()) return mirrorAlbum(id);
    return Local.getAlbum(id);
  }
  return Subsonic.getAlbum(auth(), id).then((res) => {
    useLibraryMirror.getState().saveAlbum(id, res.album, res.songs);
    return res;
  });
}

async function mirrorAlbum(
  id: string,
): Promise<{ album: Subsonic.Album; songs: Subsonic.Song[] }> {
  await loadMirror();
  const d = useLibraryMirror.getState().data.albums?.[id];
  if (!d) return Local.getAlbum(id);
  return { album: { ...d.album, coverArt: d.album.id }, songs: annotate(d.songs) };
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

// ── Navegación por carpetas (solo servidores Subsonic; la UI la oculta en
// Jellyfin y offline) ──────────────────────────────────────────────────────
export function getMusicFolders(): Promise<Subsonic.MusicFolder[]> {
  return Subsonic.getMusicFolders(auth());
}

/** Directorios de más alto nivel de una biblioteca (raíz de las carpetas). */
export function getFolderIndexes(musicFolderId?: string): Promise<Subsonic.FolderEntry[]> {
  return Subsonic.getIndexes(auth(), musicFolderId);
}

/** Contenido de un directorio: subcarpetas + canciones. */
export function getMusicDirectory(id: string): Promise<Subsonic.FolderContents> {
  return Subsonic.getMusicDirectory(auth(), id);
}

export function getArtist(id: string): Promise<{ artist: Subsonic.Artist; albums: Subsonic.Album[] }> {
  if (isOffline()) {
    if (serverOffline()) return mirrorArtist(id);
    return Local.getArtist(id);
  }
  return Subsonic.getArtist(auth(), id).then((res) => {
    useLibraryMirror.getState().saveArtist(id, res.artist, res.albums);
    return res;
  });
}

async function mirrorArtist(
  id: string,
): Promise<{ artist: Subsonic.Artist; albums: Subsonic.Album[] }> {
  await loadMirror();
  const d = useLibraryMirror.getState().data.artists?.[id];
  if (!d) return Local.getArtist(id);
  // Carátulas de los álbumes por su id (así resuelven offline).
  return { artist: d.artist, albums: d.albums.map((al) => ({ ...al, coverArt: al.id })) };
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

/**
 * Canciones al azar de la biblioteca (la mezcla de Inicio).
 *
 * Con varias bibliotecas activas se pide a cada una y se vuelve a barajar el
 * conjunto: si no, saldrían agrupadas por biblioteca, que de aleatorio tiene
 * poco.
 */
export function getRandomSongs(size = 200, genre?: string): Promise<Subsonic.Song[]> {
  if (isOffline()) return Local.getRandomSongs(size);
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.getRandomSongs(a, size, genre);
  if (ids.length === 1) return Subsonic.getRandomSongs(a, size, genre, ids[0]);
  return Promise.all(ids.map((fid) => Subsonic.getRandomSongs(a, size, genre, fid))).then((lists) =>
    shuffled(dedupeById(lists.flat())).slice(0, size),
  );
}

export function getPlaylists(): Promise<Subsonic.Playlist[]> {
  if (isOffline()) {
    if (serverOffline()) return mirrorPlaylists();
    return Local.getPlaylists();
  }
  return Subsonic.getPlaylists(auth()).then((list) => {
    useLibraryMirror.getState().savePlaylists(list);
    return list;
  });
}

/** Listas del espejo: solo las que tienen alguna canción descargada (según su
 *  tracklist guardado). La carátula se toma del primer tema descargado, que sí
 *  resuelve offline. Sin copia aún, cae al comportamiento local. */
async function mirrorPlaylists(): Promise<Subsonic.Playlist[]> {
  await loadMirror();
  const data = useLibraryMirror.getState().data;
  const list = data.playlists;
  if (!list) return Local.getPlaylists();
  const files = useDownloads.getState().files;
  const out: Subsonic.Playlist[] = [];
  for (const p of list) {
    const tracks = data.playlistTracks?.[p.id]?.songs;
    const firstDownloaded = tracks?.find((s) => files[s.id]);
    if (!firstDownloaded) continue; // sin canciones disponibles: no se muestra
    out.push({ ...p, coverArt: firstDownloaded.albumId ?? p.coverArt });
  }
  return out;
}

export function getStarred(): Promise<Subsonic.Starred> {
  if (isOffline()) {
    if (serverOffline()) return mirrorStarred();
    return Local.getStarred();
  }
  const a = auth();
  const ids = enabledFolderIds(a);
  const p = !ids
    ? Subsonic.getStarred(a)
    : ids.length === 1
      ? Subsonic.getStarred(a, ids[0])
      : Promise.all(ids.map((id) => Subsonic.getStarred(a, id))).then((parts) => ({
          songs: dedupeById(parts.flatMap((x) => x.songs)),
          albums: dedupeById(parts.flatMap((x) => x.albums)),
          artists: dedupeById(parts.flatMap((x) => x.artists)),
        }));
  // Copia para el modo offline (Biblioteca como espejo del servidor).
  return p.then((s) => {
    useLibraryMirror.getState().saveStarred(s);
    return s;
  });
}

/** Favoritos desde el espejo (offline de servidor); si aún no hay copia, cae al
 *  comportamiento local de siempre (derivado de las descargas).
 *
 *  Canciones favoritas: todas, con las no descargadas en gris. Álbumes: solo los
 *  que tienen alguna canción descargada (los vacíos no se muestran, para no
 *  recargar). Artistas: todos los favoriteados. */
async function mirrorStarred(): Promise<Subsonic.Starred> {
  await loadMirror();
  const s = useLibraryMirror.getState().data.starred;
  if (!s) return Local.getStarred();
  const catalog = await getDownloadsCatalog();
  const downloadedAlbumIds = new Set(catalog.albums.map((a) => a.id));
  const albums = (s.albums ?? [])
    .filter((al) => downloadedAlbumIds.has(al.id))
    .map((al) => ({ ...al, coverArt: al.id }));
  return {
    songs: annotate(s.songs ?? []),
    albums,
    artists: s.artists ?? [],
  };
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

/**
 * Búsqueda solo de álbumes (para filtrar al explorar). Va al servidor porque
 * la lista de álbumes está paginada: filtrar en cliente solo miraría las
 * páginas ya cargadas.
 */
export function searchAlbums(query: string, count?: number): Promise<Subsonic.Album[]> {
  if (isOffline()) return Local.searchAlbums(query, count);
  const a = auth();
  const ids = enabledFolderIds(a);
  if (!ids) return Subsonic.searchAlbums(a, query, count);
  if (ids.length === 1) return Subsonic.searchAlbums(a, query, count, ids[0]);
  return Promise.all(ids.map((id) => Subsonic.searchAlbums(a, query, count, id))).then((parts) =>
    dedupeById(parts.flat()),
  );
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
  if (isOffline()) {
    if (serverOffline()) return mirrorPlaylist(id);
    return Local.getPlaylist(id);
  }
  return Subsonic.getPlaylist(auth(), id).then((res) => {
    useLibraryMirror.getState().savePlaylistDetail(id, res.playlist, res.songs);
    return res;
  });
}

async function mirrorPlaylist(
  id: string,
): Promise<{ playlist: Subsonic.Playlist; songs: Subsonic.Song[] }> {
  await loadMirror();
  const data = useLibraryMirror.getState().data;
  const d = data.playlistTracks?.[id];
  if (d) return { playlist: d.playlist, songs: annotate(d.songs) };
  // Sin tracklist guardado: al menos usa el nombre real de la lista (si está en
  // la copia de la lista) para no mostrar el id como título.
  const meta = data.playlists?.find((p) => p.id === id);
  if (meta) return { playlist: meta, songs: [] };
  return Local.getPlaylist(id);
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

/** Reescribe el orden de una lista (arrastrar y soltar). */
export function reorderPlaylist(id: string, songIds: string[]): Promise<void> {
  if (isOffline()) return Local.reorderPlaylist(id, songIds);
  return Subsonic.reorderPlaylist(auth(), id, songIds);
}

// ── Fusión de varias bibliotecas (modo subconjunto) ──
//
// El API Subsonic solo filtra por una biblioteca por petición, así que cuando
// hay varias activas se consulta cada una y se fusionan los resultados aquí.

/** Baraja una copia (Fisher-Yates). */
function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
