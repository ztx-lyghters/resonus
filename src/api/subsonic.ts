/**
 * Cliente mínimo de la API Subsonic, que es la que expone Navidrome.
 *
 * Autenticación por token: en cada petición se envían el usuario (u), un salt
 * aleatorio (s) y el token (t = md5(password + salt)). Así no viaja nunca la
 * contraseña en claro. Ver https://www.subsonic.org/pages/api.jsp
 */
import * as Crypto from 'expo-crypto';

export const CLIENT_NAME = 'Resonus';
const API_VERSION = '1.16.1';

export interface SubsonicAuth {
  serverUrl: string;
  username: string;
  /**
   * URLs candidatas del mismo servidor/cuenta (local, dominio, Tailscale…),
   * ordenadas por prioridad; `urls[0]` es la principal (identidad del perfil).
   * `serverUrl` es la que está activa ahora mismo. Si falta, equivale a
   * `[serverUrl]`. Ver `store/autoUrl.ts` para la conmutación automática.
   */
  urls?: string[];
  /**
   * Conmutar `serverUrl` sola a la primera URL alcanzable al cambiar de red
   * (p. ej. salir de casa: IP local deja de responder → Tailscale/dominio).
   */
  autoUrl?: boolean;
  /** md5(password + salt) en hexadecimal */
  token: string;
  /** salt aleatorio usado para generar el token */
  salt: string;
  /** Tipo de servidor (para mostrar su logo); navidrome/opensubsonic/ampache. */
  serverType?: string;
  /**
   * Contraseña en claro. Se manda como `p=enc:<hex>` (método clásico de
   * Subsonic) en vez de token + salt. Se guarda cuando el servidor no valida
   * bien la auth por token (Ampache) o cuando el usuario fuerza la auth en
   * claro (`plainAuth`, p. ej. proxies/SSO que validan contra un backend
   * externo). En el resto no se guarda (se usa token + salt).
   */
  password?: string;
  /**
   * El usuario forzó la auth en claro (`p=enc:`) en el perfil, para montajes
   * (reverse-proxy/LDAP/SSO) que no pueden validar el hash con salt contra un
   * backend externo. Solo informativo; el envío en claro lo decide `password`.
   */
  plainAuth?: boolean;
  /**
   * Contraseña para la API nativa de Navidrome (JWT), que necesita usuario y
   * contraseña en claro. Solo se guarda en perfiles Navidrome; la auth
   * Subsonic sigue yendo por token + salt (por eso no reutiliza `password`).
   */
  ndPassword?: string;
  /**
   * Jellyfin (API propia, ver `jellyfin.ts`): token de sesión, id de usuario
   * e id de dispositivo. En estos perfiles `token`/`salt` van vacíos.
   */
  jfToken?: string;
  jfUserId?: string;
  jfDeviceId?: string;
}

export interface Song {
  id: string;
  title: string;
  album?: string;
  artist?: string;
  albumId?: string;
  artistId?: string;
  /**
   * Lista de artistas de la canción (extensión OpenSubsonic; Navidrome la
   * envía). Permite elegir a qué artista ir cuando hay colaboraciones.
   */
  artists?: { id: string; name: string }[];
  /** Lista de artistas del álbum (extensión OpenSubsonic; Navidrome la envía). */
  albumArtists?: { id: string; name: string }[];
  coverArt?: string;
  duration?: number;
  track?: number;
  /** Nº de disco en álbumes multi-disco (los `track` se repiten por disco). */
  discNumber?: number;
  /** Marca de tiempo de cuándo se marcó como favorita; ausente si no lo es. */
  starred?: string;
  /** Nº de reproducciones registradas por el servidor (OpenSubsonic). */
  playCount?: number;
  /** Valoración del usuario (1-5); ausente o 0 si no la ha puntuado. */
  userRating?: number;
  /** URL de streaming directa (usado para radio; evita generar URL Subsonic). */
  url?: string;
  /** Género de la canción (lo mandan Subsonic y Jellyfin). Lo usa la radio
   *  para no morirse cuando se acaban las parecidas del artista. */
  genre?: string;
  /** Formato del archivo (mp3, flac, aac…). */
  suffix?: string;
  /** Bitrate en kbps. */
  bitRate?: number;
  /** Bitrate (kbps) al que Resonus transcodificó al DESCARGAR, si aplica. Solo
   *  se fija en canciones descargadas transcodificadas; alimenta la etiqueta de
   *  calidad (el fichero en disco no lleva esta info a mano). */
  dlBitRate?: number;
  /** Profundidad de bits (16, 24…). */
  bitDepth?: number;
  /** Frecuencia de muestreo en Hz (44100, 48000, 96000…). */
  samplingRate?: number;
  /** Carátula embebida en base64 (modo sin conexión). */
  coverBase64?: string;
  /** MIME de la carátula embebida (image/jpeg, image/png…). */
  coverMime?: string;
  /**
   * Solo durante el escaneo local: el fichero trae carátula embebida pero aún
   * no se ha leído. Se descarta al construir el catálogo.
   */
  hasCover?: boolean;
  /** URI de fichero local (modo sin conexión); si está, se reproduce sin servidor. */
  localUri?: string;
  /**
   * Marcada como no disponible sin conexión: aparece en la lista (espejo de la
   * biblioteca del servidor) pero no está descargada, así que se pinta en gris
   * y no se puede reproducir. Solo se rellena en el modo offline de servidor.
   */
  unavailable?: boolean;
  /** Año de la canción (desde ID3, modo sin conexión). */
  year?: number;
  /** Fecha de modificación del fichero en ms (modo sin conexión). */
  addedAt?: number;
  /**
   * Etiquetas ReplayGain del fichero (extensión OpenSubsonic; Navidrome las
   * envía si existen). Ganancias en dB (negativas atenúan), picos lineales.
   */
  replayGain?: {
    trackGain?: number;
    albumGain?: number;
    trackPeak?: number;
    albumPeak?: number;
  };
}

export interface Album {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  /** Lista de artistas del álbum (extensión OpenSubsonic; Navidrome la envía). */
  artists?: { id: string; name: string }[];
  coverArt?: string;
  songCount?: number;
  year?: number;
  starred?: string;
  /** Sellos discográficos (extensión OpenSubsonic; Navidrome los envía). */
  recordLabels?: { name: string }[];
  /**
   * Títulos de disco por número (extensión OpenSubsonic; opcional). En álbumes
   * multi-disco permite mostrar el nombre de cada disco (tag `discsubtitle`);
   * el fallback es "Disc N". Puede faltar o traer solo algunos discos.
   */
  discTitles?: { disc: number; title: string; coverArt?: string }[];
}

export interface Artist {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  starred?: string;
}

export interface Playlist {
  id: string;
  name: string;
  songCount?: number;
  coverArt?: string;
  /** Descripción de la lista. */
  comment?: string;
  /** Visible para otros usuarios del servidor. */
  public?: boolean;
  /** Usuario dueño de la lista ("System" en las smartlists de serie de Ampache). */
  owner?: string;
  /** Fecha de creación (ISO); la mandan Navidrome/Subsonic y el perfil local. */
  created?: string;
  /** Última modificación (ISO). */
  changed?: string;
}

/** Genera un salt aleatorio en hexadecimal. */
function randomSalt(): string {
  const bytes = Crypto.getRandomBytes(8);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Ampache valida mal la auth por token; necesita la clásica (`p=enc:<hex>`). */
function isAmpache(serverType?: string): boolean {
  return serverType === 'ampache';
}

/** Hex de los bytes UTF-8 de una cadena, para el parámetro Subsonic `enc:`. */
function hexEncodeUtf8(input: string): string {
  let hex = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    const bytes: number[] =
      code < 0x80
        ? [code]
        : code < 0x800
          ? [0xc0 | (code >> 6), 0x80 | (code & 0x3f)]
          : code < 0x10000
            ? [0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)]
            : [
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f),
              ];
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Calcula las credenciales de token a partir de la contraseña.
 * Se hace una sola vez al iniciar sesión; luego se reutilizan salt y token.
 */
export async function makeAuth(
  serverUrl: string,
  username: string,
  password: string,
  serverType?: string,
  plainAuth?: boolean,
): Promise<SubsonicAuth> {
  const salt = randomSalt();
  const token = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    password + salt,
  );
  // Ampache valida mal el token, y el usuario puede forzar la auth en claro
  // (proxies/SSO): en ambos casos guardamos la contraseña para usar `p=enc:`.
  const usePlain = isAmpache(serverType) || !!plainAuth;
  return {
    serverUrl: normalizeUrl(serverUrl),
    username,
    token,
    salt,
    serverType,
    ...(usePlain ? { password } : {}),
    ...(plainAuth ? { plainAuth: true } : {}),
    // Navidrome: la API nativa (subir carátulas) necesita la contraseña.
    ...(serverType === 'navidrome' ? { ndPassword: password } : {}),
  };
}

/** Quita la barra final y asegura el esquema http(s). */
export function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function authParams(auth: SubsonicAuth): URLSearchParams {
  const base = { u: auth.username, v: API_VERSION, c: CLIENT_NAME, f: 'json' };
  // Auth clásica para Ampache; token + salt para el resto.
  if (auth.password !== undefined) {
    return new URLSearchParams({ ...base, p: `enc:${hexEncodeUtf8(auth.password)}` });
  }
  return new URLSearchParams({ ...base, t: auth.token, s: auth.salt });
}

function buildUrl(
  auth: SubsonicAuth,
  endpoint: string,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = authParams(auth);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `${auth.serverUrl}/rest/${endpoint}?${params.toString()}`;
}

const REQUEST_TIMEOUT_MS = 15000;

/** Realiza una petición y desempaqueta la respuesta Subsonic. */
/**
 * Error de una petición Subsonic. `network` distingue "el servidor no respondió"
 * (sin conexión o timeout) de "respondió con error" (credenciales, 4xx/5xx…):
 * lo primero es un problema de red del que se puede caer a modo offline; lo
 * segundo es un problema real de la cuenta que hay que mostrar.
 */
export class SubsonicRequestError extends Error {
  network: boolean;
  constructor(message: string, network: boolean) {
    super(message);
    this.name = 'SubsonicRequestError';
    this.network = network;
  }
}

async function request<T>(
  auth: SubsonicAuth,
  endpoint: string,
  extra: Record<string, string | number | undefined> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(buildUrl(auth, endpoint, extra), {
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new SubsonicRequestError('El servidor tardó demasiado en responder', true);
    }
    throw new SubsonicRequestError('No se pudo conectar con el servidor', true);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new SubsonicRequestError(`Error de red (${res.status})`, false);
  const json = await res.json();
  const sub = json['subsonic-response'];
  if (!sub) throw new SubsonicRequestError('Respuesta inesperada del servidor', false);
  if (sub.status === 'failed') {
    throw new SubsonicRequestError(sub.error?.message ?? 'Error de Subsonic', false);
  }
  return sub as T;
}

/** Comprueba que las credenciales son válidas. */
export async function ping(auth: SubsonicAuth): Promise<void> {
  await request(auth, 'ping.view');
}

export type AlbumListType =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'random'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred';

export async function getAlbumList(
  auth: SubsonicAuth,
  type: AlbumListType = 'newest',
  size = 20,
  offset = 0,
  musicFolderId?: string,
): Promise<Album[]> {
  const res = await request<{ albumList2?: { album?: Album[] } }>(
    auth,
    'getAlbumList2.view',
    { type, size, offset, ...(musicFolderId ? { musicFolderId } : {}) },
  );
  return res.albumList2?.album ?? [];
}

/** Una biblioteca del servidor (Navidrome expone cada "library" como carpeta). */
export interface MusicFolder {
  id: string;
  name: string;
}

/** Bibliotecas/carpetas raíz accesibles para el usuario. */
export async function getMusicFolders(auth: SubsonicAuth): Promise<MusicFolder[]> {
  const res = await request<{
    musicFolders?: { musicFolder?: { id: string | number; name?: string }[] };
  }>(auth, 'getMusicFolders.view');
  return (res.musicFolders?.musicFolder ?? []).map((f) => ({
    id: String(f.id),
    name: f.name ?? String(f.id),
  }));
}

/** Un directorio hijo dentro de una carpeta (navegación por carpetas). */
export interface FolderEntry {
  id: string;
  name: string;
  coverArt?: string;
}

/** Contenido de un directorio: subcarpetas y canciones. */
export interface FolderContents {
  id: string;
  name: string;
  dirs: FolderEntry[];
  songs: Song[];
}

/**
 * Nivel raíz de la navegación por carpetas: índice alfabético de directorios
 * de más alto nivel (normalmente artistas) de una biblioteca. Sus `id` sirven
 * como directorio para `getMusicDirectory`.
 */
export async function getIndexes(
  auth: SubsonicAuth,
  musicFolderId?: string,
): Promise<FolderEntry[]> {
  const res = await request<{
    indexes?: { index?: { artist?: { id: string; name: string; coverArt?: string }[] }[] };
  }>(auth, 'getIndexes.view', musicFolderId ? { musicFolderId } : undefined);
  return (res.indexes?.index ?? []).flatMap((i) => i.artist ?? []);
}

/** Contenido de un directorio concreto: subcarpetas + canciones. */
export async function getMusicDirectory(
  auth: SubsonicAuth,
  id: string,
): Promise<FolderContents> {
  const res = await request<{
    directory?: {
      id?: string;
      name?: string;
      child?: (Song & { isDir?: boolean; name?: string })[];
    };
  }>(auth, 'getMusicDirectory.view', { id });
  const dir = res.directory ?? {};
  const children = dir.child ?? [];
  const dirs: FolderEntry[] = children
    .filter((c) => c.isDir)
    .map((c) => ({ id: c.id, name: c.name ?? c.title ?? '', coverArt: c.coverArt }));
  const songs = children.filter((c) => !c.isDir) as Song[];
  return { id: dir.id ?? id, name: dir.name ?? '', dirs, songs };
}

export interface Genre {
  value: string;
  songCount?: number;
  albumCount?: number;
}

export async function getGenres(auth: SubsonicAuth): Promise<Genre[]> {
  const res = await request<{ genres?: { genre?: Genre[] } }>(auth, 'getGenres.view');
  return (res.genres?.genre ?? []).filter((g) => g.value);
}

export async function getAlbumsByGenre(
  auth: SubsonicAuth,
  genre: string,
  size = 30,
  offset = 0,
  musicFolderId?: string,
): Promise<Album[]> {
  const res = await request<{ albumList2?: { album?: Album[] } }>(
    auth,
    'getAlbumList2.view',
    { type: 'byGenre', genre, size, offset, ...(musicFolderId ? { musicFolderId } : {}) },
  );
  return res.albumList2?.album ?? [];
}

export async function getAlbum(
  auth: SubsonicAuth,
  id: string,
): Promise<{ album: Album; songs: Song[] }> {
  const res = await request<{ album: Album & { song?: Song[] } }>(
    auth,
    'getAlbum.view',
    { id },
  );
  const { song, ...album } = res.album;
  return { album, songs: song ?? [] };
}

export async function getPlaylists(auth: SubsonicAuth): Promise<Playlist[]> {
  const res = await request<{ playlists?: { playlist?: Playlist[] } }>(
    auth,
    'getPlaylists.view',
  );
  const lists = res.playlists?.playlist ?? [];
  // Ampache mezcla sus smartlists de serie (dueño "System": "Album 1*"…) con
  // las listas del usuario; se ocultan porque no son editables desde la app.
  return isAmpache(auth.serverType) ? lists.filter((p) => p.owner !== 'System') : lists;
}

export async function getPlaylist(
  auth: SubsonicAuth,
  id: string,
): Promise<{ playlist: Playlist; songs: Song[] }> {
  type Node = Playlist & { entry?: Song[] };
  const res = await request<{ playlist: Node | Node[] }>(
    auth,
    'getPlaylist.view',
    { id },
  );
  // Ampache 6 devuelve `playlist` como array de un elemento (fuera de spec).
  const { entry, ...playlist } = Array.isArray(res.playlist) ? res.playlist[0] : res.playlist;
  return { playlist, songs: entry ?? [] };
}

/** Añade una canción a una lista de reproducción existente. */
export async function addToPlaylist(
  auth: SubsonicAuth,
  playlistId: string,
  songId: string,
): Promise<void> {
  await request(auth, 'updatePlaylist.view', {
    playlistId,
    songIdToAdd: songId,
  });
}

/** Crea una lista de reproducción vacía y devuelve su id. */
export async function createPlaylist(
  auth: SubsonicAuth,
  name: string,
): Promise<string> {
  const res = await request<{ playlist?: { id: string } | { id: string }[] }>(
    auth,
    'createPlaylist.view',
    { name },
  );
  // Ampache 6 devuelve `playlist` como array de un elemento (fuera de spec).
  const node = Array.isArray(res.playlist) ? res.playlist[0] : res.playlist;
  if (node?.id) return node.id;
  // Algunos servidores no devuelven la playlist creada: la buscamos por nombre.
  const lists = await getPlaylists(auth);
  const created = lists.find((p) => p.name === name);
  if (!created) throw new Error('No se encontró la playlist creada');
  return created.id;
}

/** Elimina una lista de reproducción. */
export async function deletePlaylist(
  auth: SubsonicAuth,
  id: string,
): Promise<void> {
  await request(auth, 'deletePlaylist.view', { id });
}

/** Edita los metadatos de una lista: nombre, descripción y visibilidad. */
export async function updatePlaylist(
  auth: SubsonicAuth,
  id: string,
  changes: { name?: string; comment?: string; public?: boolean },
): Promise<void> {
  await request(auth, 'updatePlaylist.view', {
    playlistId: id,
    name: changes.name,
    comment: changes.comment,
    public: changes.public === undefined ? undefined : String(changes.public),
  });
}

/**
 * Reescribe el orden completo de una lista. Subsonic no tiene "mover": se
 * recrea la lista con `createPlaylist` pasando su `playlistId` y todos los
 * `songId` en el nuevo orden (reemplaza las entradas). POST para no generar
 * URLs enormes con listas largas.
 */
export async function reorderPlaylist(
  auth: SubsonicAuth,
  id: string,
  songIds: string[],
): Promise<void> {
  const params = authParams(auth);
  params.set('playlistId', id);
  for (const sid of songIds) params.append('songId', sid);
  const res = await fetch(`${auth.serverUrl}/rest/createPlaylist.view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Error de red (${res.status})`);
  const json = await res.json();
  const sub = json['subsonic-response'];
  if (sub?.status === 'failed') throw new Error(sub.error?.message ?? 'Error de Subsonic');
}

/** Quita una canción de una lista por su índice (posición en la lista). */
export async function removeFromPlaylist(
  auth: SubsonicAuth,
  id: string,
  index: number,
): Promise<void> {
  await request(auth, 'updatePlaylist.view', {
    playlistId: id,
    songIndexToRemove: index,
  });
}

export interface SearchResult {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
}

export async function search(
  auth: SubsonicAuth,
  query: string,
  musicFolderId?: string,
): Promise<SearchResult> {
  const res = await request<{
    searchResult3?: { artist?: Artist[]; album?: Album[]; song?: Song[] };
  }>(auth, 'search3.view', {
    query,
    songCount: 20,
    albumCount: 20,
    artistCount: 20,
    ...(musicFolderId ? { musicFolderId } : {}),
  });
  const r = res.searchResult3 ?? {};
  return {
    artists: r.artist ?? [],
    albums: r.album ?? [],
    songs: r.song ?? [],
  };
}

/**
 * Búsqueda solo de álbumes. Aparte de `search` a propósito: aquella pide
 * artistas y canciones que quien filtra álbumes tira, y está capada a 20.
 */
export async function searchAlbums(
  auth: SubsonicAuth,
  query: string,
  count = 50,
  musicFolderId?: string,
): Promise<Album[]> {
  const res = await request<{ searchResult3?: { album?: Album[] } }>(auth, 'search3.view', {
    query,
    albumCount: count,
    // A 0 para que el servidor no busque ni mande lo que no se pinta.
    songCount: 0,
    artistCount: 0,
    ...(musicFolderId ? { musicFolderId } : {}),
  });
  return res.searchResult3?.album ?? [];
}

export async function getArtists(auth: SubsonicAuth, musicFolderId?: string): Promise<Artist[]> {
  const res = await request<{
    artists?: { index?: { artist?: Artist[] }[] };
  }>(auth, 'getArtists.view', musicFolderId ? { musicFolderId } : undefined);
  // La respuesta agrupa los artistas por letra inicial; los aplanamos.
  return (res.artists?.index ?? []).flatMap((i) => i.artist ?? []);
}

export async function getArtist(
  auth: SubsonicAuth,
  id: string,
): Promise<{ artist: Artist; albums: Album[] }> {
  const res = await request<{ artist: Artist & { album?: Album[] } }>(
    auth,
    'getArtist.view',
    { id },
  );
  const { album, ...artist } = res.artist;
  return { artist, albums: album ?? [] };
}

/**
 * Álbumes de otros artistas donde este aparece ("Aparece en"). Subsonic no
 * tiene endpoint para esto, así que se aproxima con search3: canciones que
 * casan con el nombre, filtradas a las que el artista participa y cuyo álbum
 * no es suyo (vía `albumArtists`; en servidores sin la extensión el filtrado
 * final por discografía lo hace la pantalla).
 */
export async function getAppearsOn(
  auth: SubsonicAuth,
  artistId: string,
  artistName: string,
  musicFolderId?: string,
): Promise<Album[]> {
  const res = await request<{ searchResult3?: { song?: Song[] } }>(auth, 'search3.view', {
    query: artistName,
    songCount: 200,
    albumCount: 0,
    artistCount: 0,
    ...(musicFolderId ? { musicFolderId } : {}),
  });
  const byAlbum = new Map<string, Album>();
  for (const s of res.searchResult3?.song ?? []) {
    if (!s.albumId || byAlbum.has(s.albumId)) continue;
    const participates = s.artists
      ? s.artists.some((a) => a.id === artistId)
      : s.artistId === artistId;
    if (!participates) continue;
    if (s.albumArtists?.some((a) => a.id === artistId)) continue;
    byAlbum.set(s.albumId, {
      id: s.albumId,
      name: s.album ?? '',
      artist: s.albumArtists?.map((a) => a.name).join(', ') || undefined,
      coverArt: s.coverArt,
      year: s.year,
    });
  }
  return [...byAlbum.values()];
}

/**
 * Canciones más escuchadas. Subsonic no tiene endpoint global de canciones
 * por reproducciones, así que se compone: álbumes "frequent" (los del Home)
 * → sus canciones → ordenadas por el `playCount` que manda OpenSubsonic. Si
 * el servidor no manda playCount por canción, se dejan en el orden de los
 * álbumes frecuentes (que ya es una buena aproximación).
 */
export async function getMostPlayedSongs(
  auth: SubsonicAuth,
  size = 50,
  musicFolderId?: string,
): Promise<Song[]> {
  const albums = await getAlbumList(auth, 'frequent', 15, 0, musicFolderId);
  const details = await Promise.all(
    albums.map((al) => getAlbum(auth, al.id).catch(() => ({ album: al, songs: [] as Song[] }))),
  );
  const songs = details.flatMap((d) => d.songs);
  if (!songs.some((s) => (s.playCount ?? 0) > 0)) return songs.slice(0, size);
  return songs
    .filter((s) => (s.playCount ?? 0) > 0)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, size);
}

/**
 * Canciones al azar de toda la biblioteca (la mezcla de Inicio).
 *
 * `size` no es un capricho: el endpoint topa alrededor de 500, así que esto no
 * baraja la biblioteca entera sino una muestra. En la práctica es lo que se
 * quiere; nadie navega una cola de 20.000 canciones.
 *
 * Acepta `genre` porque es lo que haría falta para una "radio de género" sin
 * duplicar nada de esto.
 */
export async function getRandomSongs(
  auth: SubsonicAuth,
  size = 200,
  genre?: string,
  musicFolderId?: string,
): Promise<Song[]> {
  const res = await request<{ randomSongs?: { song?: Song[] } }>(
    auth,
    'getRandomSongs.view',
    { size, ...(genre ? { genre } : {}), ...(musicFolderId ? { musicFolderId } : {}) },
  );
  return res.randomSongs?.song ?? [];
}

/** Canciones más populares de un artista (por nombre). */
export async function getTopSongs(
  auth: SubsonicAuth,
  artist: string,
  count = 10,
): Promise<Song[]> {
  const res = await request<{ topSongs?: { song?: Song[] } }>(
    auth,
    'getTopSongs.view',
    { artist, count },
  );
  return res.topSongs?.song ?? [];
}

/** Canciones parecidas a una dada (getSimilarSongs2): autoplay / radio. */
export async function getSimilarSongs(
  auth: SubsonicAuth,
  id: string,
  count = 20,
): Promise<Song[]> {
  const res = await request<{ similarSongs2?: { song?: Song[] } }>(
    auth,
    'getSimilarSongs2.view',
    { id, count },
  );
  return res.similarSongs2?.song ?? [];
}

export interface ArtistInfo {
  biography?: string;
  imageUrl?: string;
  similarArtists: Artist[];
}

/** Info ampliada del artista (biografía, foto y similares) de getArtistInfo2. */
export async function getArtistInfo(
  auth: SubsonicAuth,
  id: string,
): Promise<ArtistInfo> {
  const res = await request<{
    artistInfo2?: {
      biography?: string;
      largeImageUrl?: string;
      similarArtist?: Artist[];
    };
  }>(auth, 'getArtistInfo2.view', { id });
  const info = res.artistInfo2 ?? {};
  // La biografía suele venir con HTML (enlace a Last.fm); lo quitamos.
  const biography = info.biography?.replace(/<[^>]+>/g, '').trim() || undefined;
  // El servidor puede repetir un similar (mismo id) → keys duplicadas en React.
  const seen = new Set<string>();
  const similarArtists = (info.similarArtist ?? []).filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  return {
    biography,
    imageUrl: info.largeImageUrl || undefined,
    similarArtists,
  };
}

export interface Starred {
  songs: Song[];
  albums: Album[];
  artists: Artist[];
}

export async function getStarred(auth: SubsonicAuth, musicFolderId?: string): Promise<Starred> {
  const res = await request<{
    starred2?: { song?: Song[]; album?: Album[]; artist?: Artist[] };
  }>(auth, 'getStarred2.view', musicFolderId ? { musicFolderId } : undefined);
  const s = res.starred2 ?? {};
  return {
    songs: s.song ?? [],
    albums: s.album ?? [],
    artists: s.artist ?? [],
  };
}

export type StarType = 'song' | 'album' | 'artist';

function starParam(id: string, type: StarType): Record<string, string> {
  // Subsonic usa un parámetro distinto según el tipo de elemento.
  if (type === 'album') return { albumId: id };
  if (type === 'artist') return { artistId: id };
  return { id };
}

/** Marca un elemento como favorito. */
export async function star(
  auth: SubsonicAuth,
  id: string,
  type: StarType = 'song',
): Promise<void> {
  await request(auth, 'star.view', starParam(id, type));
}

/** Quita un elemento de favoritos. */
export async function unstar(
  auth: SubsonicAuth,
  id: string,
  type: StarType = 'song',
): Promise<void> {
  await request(auth, 'unstar.view', starParam(id, type));
}

/** Valora una canción de 1 a 5 estrellas; 0 quita la valoración. */
export async function setRating(auth: SubsonicAuth, id: string, rating: number): Promise<void> {
  await request(auth, 'setRating.view', { id, rating: String(rating) });
}

export interface ScanStatus {
  scanning: boolean;
  count: number;
}

/** Estado del escaneo de la biblioteca del servidor. */
export async function getScanStatus(auth: SubsonicAuth): Promise<ScanStatus> {
  const res = await request<{ scanStatus?: { scanning?: boolean; count?: number } }>(
    auth,
    'getScanStatus.view',
  );
  return {
    scanning: res.scanStatus?.scanning ?? false,
    count: res.scanStatus?.count ?? 0,
  };
}

/** Lanza un nuevo escaneo de la biblioteca en el servidor. */
export async function startScan(auth: SubsonicAuth): Promise<ScanStatus> {
  const res = await request<{ scanStatus?: { scanning?: boolean; count?: number } }>(
    auth,
    'startScan.view',
  );
  return {
    scanning: res.scanStatus?.scanning ?? false,
    count: res.scanStatus?.count ?? 0,
  };
}

/** Obtiene la letra de una canción (puede venir vacía si no hay). */
export async function getLyrics(
  auth: SubsonicAuth,
  artist: string,
  title: string,
): Promise<string> {
  const res = await request<{ lyrics?: { value?: string } }>(
    auth,
    'getLyrics.view',
    { artist, title },
  );
  return res.lyrics?.value?.trim() ?? '';
}

export interface LyricLine {
  /** Milisegundos desde el inicio de la pista; solo en letra sincronizada. */
  start?: number;
  value: string;
}

export interface SongLyrics {
  synced: boolean;
  lines: LyricLine[];
}

/**
 * Letra estructurada por id de canción (extensión OpenSubsonic `songLyrics`,
 * la soportan Navidrome y Ampache 7): líneas con timestamp si la letra está
 * sincronizada. Lanza en servidores sin la extensión; null si no hay letra.
 */
export async function getLyricsBySongId(
  auth: SubsonicAuth,
  id: string,
): Promise<SongLyrics | null> {
  interface StructuredLyrics {
    synced?: boolean;
    /** Desplazamiento global en ms; positivo = la letra debe aparecer antes. */
    offset?: number;
    line?: { start?: number; value?: string }[];
  }
  const res = await request<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>(
    auth,
    'getLyricsBySongId.view',
    { id },
  );
  const all = res.lyricsList?.structuredLyrics ?? [];
  const pick = all.find((l) => l.synced && l.line?.length) ?? all.find((l) => l.line?.length);
  if (!pick?.line?.length) return null;
  const synced = !!pick.synced;
  const offset = pick.offset ?? 0;
  return {
    synced,
    lines: pick.line.map((ln) => ({
      value: ln.value ?? '',
      ...(synced && ln.start !== undefined
        ? { start: Math.max(0, ln.start - offset) }
        : {}),
    })),
  };
}

export interface SavedQueue {
  entries: Song[];
  current?: string;
  /** Posición en la pista actual, en milisegundos. */
  position: number;
}

/** Guarda la cola de reproducción en el servidor (savePlayQueue). */
export async function savePlayQueue(
  auth: SubsonicAuth,
  ids: string[],
  currentId: string,
  positionMs: number,
): Promise<void> {
  if (ids.length === 0) return;
  const params = authParams(auth);
  for (const id of ids) params.append('id', id);
  if (currentId) params.set('current', currentId);
  params.set('position', String(Math.max(0, Math.floor(positionMs))));
  try {
    // POST con los parámetros en el cuerpo: evita URLs gigantes con colas largas.
    await fetch(`${auth.serverUrl}/rest/savePlayQueue.view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch {
    // Best-effort; ignoramos errores de red al guardar la cola.
  }
}

/** Recupera la cola guardada en el servidor (getPlayQueue). */
export async function getPlayQueue(auth: SubsonicAuth): Promise<SavedQueue | null> {
  const res = await request<{
    playQueue?: { entry?: Song[]; current?: string; position?: number };
  }>(auth, 'getPlayQueue.view');
  const pq = res.playQueue;
  if (!pq?.entry || pq.entry.length === 0) return null;
  return { entries: pq.entry, current: pq.current, position: pq.position ?? 0 };
}

/** Informa al servidor de que se ha reproducido una canción (scrobble). */
/**
 * `submission=false` anuncia "reproduciendo ahora" (no cuenta reproducción);
 * `true` registra la escucha de verdad (contadores y Last.fm/ListenBrainz).
 */
export async function scrobble(auth: SubsonicAuth, id: string, submission = true): Promise<void> {
  try {
    await request(auth, 'scrobble.view', { id, submission: submission ? 'true' : 'false' });
  } catch {
    // El scrobble es opcional; ignoramos sus errores.
  }
}

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
}

/** Devuelve las emisoras de radio guardadas en el servidor. */
export async function getRadioStations(
  auth: SubsonicAuth,
): Promise<RadioStation[]> {
  const res = await request<{
    internetRadioStations?: { internetRadioStation?: RadioStation[] };
  }>(auth, 'getInternetRadioStations.view');
  return res.internetRadioStations?.internetRadioStation ?? [];
}

/**
 * Crea una emisora de radio por internet en el servidor. Devuelve su id si se
 * puede averiguar: `createInternetRadioStation` no lo devuelve (fuera de spec),
 * así que se busca la recién creada por nombre + URL. Sirve para ponerle
 * carátula al momento (que se guarda en el dispositivo, por id).
 */
export async function createRadioStation(
  auth: SubsonicAuth,
  name: string,
  streamUrl: string,
  homePageUrl?: string,
): Promise<string | undefined> {
  await request(auth, 'createInternetRadioStation.view', {
    name,
    streamUrl,
    homepageUrl: homePageUrl || undefined,
  });
  try {
    const stations = await getRadioStations(auth);
    // De atrás hacia delante: si hay duplicados de nombre+URL, la última es la
    // que acabamos de crear.
    const match = [...stations].reverse().find((s) => s.name === name && s.streamUrl === streamUrl);
    return match?.id;
  } catch {
    return undefined;
  }
}

/** Edita una emisora de radio existente. */
export async function updateRadioStation(
  auth: SubsonicAuth,
  id: string,
  name: string,
  streamUrl: string,
  homePageUrl?: string,
): Promise<void> {
  await request(auth, 'updateInternetRadioStation.view', {
    id,
    name,
    streamUrl,
    homepageUrl: homePageUrl || undefined,
  });
}

/** Elimina una emisora de radio del servidor. */
export async function deleteRadioStation(
  auth: SubsonicAuth,
  id: string,
): Promise<void> {
  await request(auth, 'deleteInternetRadioStation.view', { id });
}

/** URL de la carátula. `id` puede venir de un álbum, canción o playlist. */
export function coverArtUrl(
  auth: SubsonicAuth,
  id: string | undefined,
  size = 300,
): string | undefined {
  if (!id) return undefined;
  return buildUrl(auth, 'getCoverArt.view', { id, size });
}

/** URL de descarga del fichero original, sin transcodificar. */
export function downloadUrl(auth: SubsonicAuth, id: string): string {
  return buildUrl(auth, 'download.view', { id });
}

/**
 * URL de streaming de una canción. Si `maxBitRate` > 0, el servidor
 * transcodifica a ese bitrate (kbps) para ahorrar datos. `format` fuerza el
 * códec de salida (p. ej. `opus`); vacío deja el transcoder por defecto del
 * servidor. Solo tiene efecto cuando de verdad se transcodifica (con
 * `maxBitRate` a 0 el servidor sirve el fichero original y lo ignora).
 */
export function streamUrl(
  auth: SubsonicAuth,
  id: string,
  maxBitRate = 0,
  timeOffset = 0,
  format = '',
): string {
  return buildUrl(auth, 'stream.view', {
    id,
    maxBitRate: maxBitRate > 0 ? maxBitRate : undefined,
    format: maxBitRate > 0 && format ? format : undefined,
    // Arrancar la transcodificación en este segundo (extensión OpenSubsonic
    // `transcodeOffset`): así se puede "buscar" en streams transcodificados.
    timeOffset: timeOffset > 0 ? Math.floor(timeOffset) : undefined,
  });
}

/** Nombres de las extensiones OpenSubsonic que anuncia el servidor. */
export async function getOpenSubsonicExtensions(auth: SubsonicAuth): Promise<string[]> {
  const res = await request<{ openSubsonicExtensions?: { name: string }[] }>(
    auth,
    'getOpenSubsonicExtensions.view',
    {},
  );
  return (res.openSubsonicExtensions ?? []).map((e) => e.name);
}

// ── Jukebox ──────────────────────────────────────────────────────────────────
// API estándar Subsonic `jukeboxControl`: el servidor reproduce por su propio
// hardware de audio (altavoces/DAC) y la app hace de mando a distancia; no se
// stremea nada al teléfono. Solo servidores Subsonic con el rol jukebox
// habilitado por el admin (ver store/jukebox.ts para la integración).

export interface JukeboxStatus {
  /** Índice de la pista actual dentro de la lista del servidor. */
  currentIndex: number;
  playing: boolean;
  /** Ganancia 0..1. */
  gain: number;
  /** Posición en segundos dentro de la pista actual. */
  position: number;
}

function parseJukeboxStatus(raw: unknown): JukeboxStatus {
  const s = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, def: number) => (typeof v === 'number' ? v : def);
  return {
    currentIndex: num(s.currentIndex, 0),
    playing: s.playing === true,
    gain: num(s.gain, 1),
    position: num(s.position, 0),
  };
}

/** `jukeboxControl.view`: devuelve el estado tras aplicar la acción. */
async function jukeboxControl(
  auth: SubsonicAuth,
  action: string,
  extra: Record<string, string | number | undefined> = {},
): Promise<JukeboxStatus> {
  const res = await request<{ jukeboxStatus?: unknown; jukeboxPlaylist?: unknown }>(
    auth,
    'jukeboxControl.view',
    { action, ...extra },
  );
  // `get`/`set` responden con jukeboxPlaylist; el resto con jukeboxStatus.
  return parseJukeboxStatus(res.jukeboxStatus ?? res.jukeboxPlaylist);
}

export const jukeboxStatus = (auth: SubsonicAuth) => jukeboxControl(auth, 'status');
/** Reemplaza la lista del servidor por una sola pista (id de la biblioteca). */
export const jukeboxSet = (auth: SubsonicAuth, id: string) => jukeboxControl(auth, 'set', { id });
export const jukeboxStart = (auth: SubsonicAuth) => jukeboxControl(auth, 'start');
export const jukeboxStop = (auth: SubsonicAuth) => jukeboxControl(auth, 'stop');
export const jukeboxClear = (auth: SubsonicAuth) => jukeboxControl(auth, 'clear');
/** Salta al índice dado (con offset opcional en segundos dentro de la pista). */
export const jukeboxSkip = (auth: SubsonicAuth, index: number, offsetSec = 0) =>
  jukeboxControl(auth, 'skip', { index, offset: offsetSec > 0 ? Math.floor(offsetSec) : undefined });
export const jukeboxSetGain = (auth: SubsonicAuth, gain: number) =>
  jukeboxControl(auth, 'setGain', { gain: Math.max(0, Math.min(1, gain)) });

/**
 * ¿El servidor permite el modo jukebox para este usuario? Se deduce del
 * `jukeboxRole` que devuelve `getUser`. Cualquier fallo (endpoint ausente,
 * servidor que no es Subsonic, sin permiso) cuenta como "no disponible".
 */
export async function hasJukeboxRole(auth: SubsonicAuth): Promise<boolean> {
  try {
    const res = await request<{ user?: { jukeboxRole?: boolean } }>(auth, 'getUser.view', {
      username: auth.username,
    });
    return res.user?.jukeboxRole === true;
  } catch {
    return false;
  }
}
