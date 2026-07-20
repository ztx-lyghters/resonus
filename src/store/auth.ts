/**
 * Estado de sesión con soporte de varios perfiles guardados.
 *
 * - `auth`: sesión activa.
 * - `profiles`: cuentas guardadas (servidor u offline) entre las que elegir.
 *
 * Cerrar sesión solo desactiva la sesión activa; los perfiles se conservan
 * para poder volver a entrar con un toque.
 */
import { create } from 'zustand';

import {
  makeAuth,
  normalizeUrl,
  ping,
  reachable,
  SubsonicRequestError,
  type SubsonicAuth,
} from '@/api/backend';
import { primaryUrl } from '@/lib/serverUrls';
import { clearLocalCatalog } from '@/lib/localLibrary';
import { queryClient } from '@/lib/query';
import { deleteItem, getItem, setItem } from '@/lib/storage';

const ACTIVE_KEY = 'resonus.auth';
const PROFILES_KEY = 'resonus.profiles';
const OFFLINE_KEY = 'resonus.offline';
const OFFLINE_AUTO_KEY = 'resonus.offlineAuto';
const OFFLINE_SOURCE_KEY = 'resonus.offlineSource';

/** De dónde saca la música el modo sin conexión. */
export type OfflineSource =
  | { mode: 'device' }
  | { mode: 'folder'; uri: string };

export type ServerProfile = SubsonicAuth & { _type: 'server' };
export type OfflineProfile = { _type: 'offline'; name: string; source: OfflineSource };
export type Profile = ServerProfile | OfflineProfile;

/** Asegura que un perfil de servidor tenga `urls` (migración de los antiguos). */
function withUrls(a: SubsonicAuth): SubsonicAuth {
  if (a.urls && a.urls.length > 0) return a;
  return { ...a, urls: [a.serverUrl] };
}

function same(a: Profile, b: Profile): boolean {
  if (a._type === 'offline' && b._type === 'offline') {
    return a.name === b.name;
  }
  if (a._type === 'server' && b._type === 'server') {
    return primaryUrl(a) === primaryUrl(b) && a.username === b.username;
  }
  return false;
}

function sameSource(a: OfflineSource, b: OfflineSource): boolean {
  if (a.mode === 'folder' && b.mode === 'folder') return a.uri === b.uri;
  return a.mode === b.mode;
}

function offlineLabel(source: OfflineSource): string {
  if (source.mode === 'folder') {
    const decoded = decodeURIComponent(source.uri);
    return decoded.split(/[:/]/).filter(Boolean).pop() ?? 'Sin conexión';
  }
  return 'Sin conexión';
}

/**
 * Persiste un cambio en el perfil ACTIVO: actualiza `auth`, su entrada en
 * `profiles` (vía `patch`) y ambas claves de almacenamiento. Lo comparten las
 * acciones de URL, que siempre operan sobre el perfil activo.
 */
async function persistActive(
  get: () => AuthState,
  set: (partial: Partial<AuthState>) => void,
  auth: SubsonicAuth,
  patch: (p: ServerProfile) => ServerProfile,
): Promise<void> {
  const asProfile: ServerProfile = { ...auth, _type: 'server' };
  const profiles = get().profiles.map((p) =>
    p._type === 'server' && same(p, asProfile) ? patch(p) : p,
  );
  await setItem(ACTIVE_KEY, JSON.stringify(auth));
  await setItem(PROFILES_KEY, JSON.stringify(profiles));
  set({ auth, profiles });
}

interface AuthState {
  auth: SubsonicAuth | null;
  profiles: Profile[];
  /** Sesión sin conexión: reproduce ficheros locales sin servidor. */
  offline: boolean;
  /**
   * El modo offline lo activó la app sola porque el servidor no respondía (no
   * el usuario). Solo con una cuenta de servidor: al volver a ser alcanzable se
   * reconecta automáticamente. Un offline manual deja esto en false y no se
   * revierte solo. Ver store/autoUrl.ts.
   */
  autoOffline: boolean;
  /** Origen elegido para la música local (null = aún sin elegir). */
  offlineSource: OfflineSource | null;
  /** true mientras se rehidrata la sesión guardada al arrancar. */
  hydrating: boolean;
  login: (
    serverUrl: string,
    username: string,
    password: string,
    serverType?: string,
    plainAuth?: boolean,
  ) => Promise<void>;
  /**
   * Entra en un perfil guardado. Con un perfil de servidor sin red, en vez de
   * fallar cae al modo offline de esa cuenta (sus descargas). Devuelve a qué
   * modo se entró para que la UI avise.
   */
  switchProfile: (profile: Profile) => Promise<'online' | 'offline'>;
  removeProfile: (profile: Profile) => Promise<void>;
  /** Conmuta la URL activa del perfil (una de sus `urls`). Recarga la pista en
   *  curso contra la nueva URL; la cola se conserva. */
  setActiveUrl: (url: string) => Promise<void>;
  /** Añade una URL alternativa al perfil activo. Valida que responda con las
   *  credenciales actuales (mismo servidor). Devuelve el resultado para la UI. */
  addServerUrl: (url: string) => Promise<'ok' | 'duplicate' | 'unreachable'>;
  /** Quita una URL del perfil activo (si era la activa, vuelve a la principal). */
  removeServerUrl: (url: string) => Promise<void>;
  /** Activa/desactiva la conmutación automática de URL en el perfil activo. */
  setAutoUrl: (value: boolean) => Promise<void>;
  /**
   * Guarda la contraseña de la API nativa de Navidrome en el perfil activo
   * (para perfiles creados antes de que el login la guardara).
   */
  saveNativePassword: (password: string) => Promise<void>;
  enterOffline: () => Promise<void>;
  /**
   * Pasa la cuenta de servidor a modo offline (mostrar/reproducir descargas)
   * conservando la sesión. `auto` = lo decidió la app por servidor caído.
   */
  goOffline: (auto: boolean) => Promise<void>;
  /** Vuelve online en la misma cuenta (instantáneo, sin re-login). */
  goOnline: () => Promise<void>;
  setOfflineSource: (source: OfflineSource | null) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

/**
 * Id estable del perfil activo para partir el almacenamiento por perfil
 * (ajustes, playlists locales, favoritos locales…). Cuenta de servidor:
 * `url|usuario` (también en su modo offline, que conserva `auth`); perfil
 * local: `local`; sin sesión: `default`. Al usarlo como clave de SecureStore
 * hay que hashearlo (la URL trae `:`, `/`, `|`, no admitidos).
 */
export function profileScopeId(): string {
  const { auth, offline } = useAuthStore.getState();
  if (auth) return `${auth.urls?.[0] ?? auth.serverUrl}|${auth.username}`;
  return offline ? 'local' : 'default';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  auth: null,
  profiles: [],
  offline: false,
  autoOffline: false,
  offlineSource: null,
  hydrating: true,

  hydrate: async () => {
    try {
      const [rawAuth, rawProfiles, rawOffline, rawAuto, rawSource] = await Promise.all([
        getItem(ACTIVE_KEY),
        getItem(PROFILES_KEY),
        getItem(OFFLINE_KEY),
        getItem(OFFLINE_AUTO_KEY),
        getItem(OFFLINE_SOURCE_KEY),
      ]);
      const profiles: Profile[] = rawProfiles
        ? (JSON.parse(rawProfiles) as any[]).map((p: any): Profile => {
            if (p._type === 'offline') return p as OfflineProfile;
            // Perfiles de servidor (con o sin `_type`): garantiza `urls`.
            return { ...withUrls(p), _type: 'server' } as ServerProfile;
          })
        : [];
      const activeAuth = rawAuth ? (JSON.parse(rawAuth) as SubsonicAuth) : null;
      set({
        auth: activeAuth ? withUrls(activeAuth) : null,
        profiles,
        offline: rawOffline === '1',
        autoOffline: rawAuto === '1',
        offlineSource: rawSource ? (JSON.parse(rawSource) as OfflineSource) : null,
      });
    } catch {
      // Si algo falla, se pedirá login de nuevo.
    } finally {
      set({ hydrating: false });
    }
  },

  login: async (serverUrl, username, password, serverType, plainAuth) => {
    const base = await makeAuth(serverUrl, username, password, serverType, plainAuth);
    const auth: ServerProfile = {
      ...base,
      // Nace con su URL como única candidata; se añaden más desde Ajustes › Red.
      urls: [base.serverUrl],
      _type: 'server',
    };
    // Si es un perfil ya conocido (re-login por cambio de contraseña, etc.),
    // conservamos las URLs alternativas y la preferencia de conmutación.
    const existing = get().profiles.find(
      (p): p is ServerProfile => p._type === 'server' && same(p, auth),
    );
    if (existing?.urls?.length) {
      auth.urls = existing.urls;
      auth.autoUrl = existing.autoUrl;
    }
    await ping(auth);
    // El perfil recién usado va el primero (orden por último uso).
    const profiles = [auth, ...get().profiles.filter((p) => !same(p, auth))];
    await setItem(ACTIVE_KEY, JSON.stringify(auth));
    await setItem(PROFILES_KEY, JSON.stringify(profiles));
    await deleteItem(OFFLINE_KEY);
    await deleteItem(OFFLINE_AUTO_KEY);
    set({ auth, profiles, offline: false, autoOffline: false });
    // Sube al servidor lo que quedara pendiente en el outbox de este perfil
    // (p. ej. cambios hechos offline antes de cerrar sesión). Best-effort.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await require('@/api/data').flushOfflineQueue(auth);
    } catch {
      // No bloquea el inicio de sesión.
    }
    queryClient.clear();
  },

  switchProfile: async (profile) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await require('./player').usePlayerStore.getState().reset();
    // Mueve el perfil elegido al principio (orden por último uso).
    const reordered = [profile, ...get().profiles.filter((p) => !same(p, profile))];
    if (profile._type === 'offline') {
      await setItem(OFFLINE_KEY, '1');
      await deleteItem(OFFLINE_AUTO_KEY);
      await setItem(OFFLINE_SOURCE_KEY, JSON.stringify(profile.source));
      await setItem(PROFILES_KEY, JSON.stringify(reordered));
      queryClient.clear();
      set({
        auth: null,
        offline: true,
        autoOffline: false,
        offlineSource: profile.source,
        profiles: reordered,
      });
      return 'offline';
    }
    try {
      await ping(profile);
    } catch (e) {
      // Sin red (no un rechazo de la cuenta): en vez de dejar sin entrar, se
      // entra en el modo offline de esa cuenta —conservando `auth`— para oír las
      // descargas. `autoOffline` hace que se reconecte sola al volver la red.
      if (e instanceof SubsonicRequestError && e.network) {
        await setItem(ACTIVE_KEY, JSON.stringify(profile));
        await setItem(PROFILES_KEY, JSON.stringify(reordered));
        await setItem(OFFLINE_KEY, '1');
        await setItem(OFFLINE_AUTO_KEY, '1');
        queryClient.clear();
        set({ auth: profile, profiles: reordered, offline: true, autoOffline: true });
        return 'offline';
      }
      throw e;
    }
    await setItem(ACTIVE_KEY, JSON.stringify(profile));
    await setItem(PROFILES_KEY, JSON.stringify(reordered));
    await deleteItem(OFFLINE_KEY);
    await deleteItem(OFFLINE_AUTO_KEY);
    set({ auth: profile, profiles: reordered, offline: false, autoOffline: false });
    // Sube al servidor lo que quedara pendiente en el outbox de este perfil.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await require('@/api/data').flushOfflineQueue(profile);
    } catch {
      // No bloquea el cambio de perfil.
    }
    queryClient.clear();
    return 'online';
  },

  removeProfile: async (profile) => {
    const profiles = get().profiles.filter((p) => !same(p, profile));
    await setItem(PROFILES_KEY, JSON.stringify(profiles));
    set({ profiles });
  },

  setActiveUrl: async (url) => {
    const current = get().auth;
    if (!current || current.serverUrl === url) return;
    const urls = current.urls ?? [current.serverUrl];
    if (!urls.includes(url)) return; // no es una URL candidata del perfil
    const auth: SubsonicAuth = { ...current, serverUrl: url };
    await persistActive(get, set, auth, (p) => ({ ...p, serverUrl: url }));
    // Refresca la biblioteca contra la URL nueva. Es la misma cuenta, así que no
    // vaciamos el caché como al cambiar de perfil (daría flicker); solo marcamos
    // todo obsoleto para que lo visible se vuelva a pedir del servidor activo.
    // Sin esto, lo que se hubiera cacheado (o fallado) contra la URL vieja se
    // quedaba en pantalla hasta refrescar a mano. Cubre el switch manual y el
    // automático por red, que ambos pasan por aquí.
    void queryClient.invalidateQueries();
    // La pista en curso apuntaba a la URL vieja (ya sin respuesta): la
    // recargamos contra la nueva. La cola se conserva.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./player').usePlayerStore.getState().reloadCurrent();
  },

  addServerUrl: async (url) => {
    const current = get().auth;
    if (!current) return 'unreachable';
    const norm = normalizeUrl(url);
    const urls = current.urls ?? [current.serverUrl];
    if (urls.includes(norm)) return 'duplicate';
    // Debe responder con las credenciales actuales: así confirmamos que es el
    // mismo servidor/cuenta y no una URL cualquiera.
    if (!(await reachable(current, norm))) return 'unreachable';
    const next = [...urls, norm]; // orden de inserción; urls[0] sigue siendo la principal
    // NO tocamos `autoUrl`: la conmutación automática la enciende el usuario a
    // mano si la quiere (añadir una URL no debe activar nada por su cuenta).
    const auth: SubsonicAuth = { ...current, urls: next };
    await persistActive(get, set, auth, (p) => ({ ...p, urls: next }));
    return 'ok';
  },

  removeServerUrl: async (url) => {
    const current = get().auth;
    if (!current) return;
    // La principal (urls[0]) es la identidad del perfil: no se borra.
    if (url === primaryUrl(current)) return;
    const urls = (current.urls ?? [current.serverUrl]).filter((u) => u !== url);
    const wasActive = current.serverUrl === url;
    const serverUrl = wasActive ? urls[0] : current.serverUrl;
    const auth: SubsonicAuth = { ...current, urls, serverUrl };
    await persistActive(get, set, auth, (p) => ({ ...p, urls, serverUrl }));
    if (wasActive) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./player').usePlayerStore.getState().reloadCurrent();
    }
  },

  setAutoUrl: async (value) => {
    const current = get().auth;
    if (!current) return;
    const auth: SubsonicAuth = { ...current, autoUrl: value };
    await persistActive(get, set, auth, (p) => ({ ...p, autoUrl: value }));
  },

  saveNativePassword: async (password) => {
    const current = get().auth;
    if (!current) return;
    const auth: ServerProfile = { ...current, ndPassword: password, _type: 'server' };
    const profiles = get().profiles.map((p) =>
      same(p, auth) ? auth : p,
    );
    await setItem(ACTIVE_KEY, JSON.stringify(auth));
    await setItem(PROFILES_KEY, JSON.stringify(profiles));
    set({ auth, profiles });
  },

  enterOffline: async () => {
    await setItem(OFFLINE_KEY, '1');
    queryClient.clear();
    set({ offline: true });
  },

  goOffline: async (auto) => {
    // Conserva `auth`: es la misma cuenta, pero mostrando/​reproduciendo las
    // descargas. Los envíos al servidor (scrobble, now-playing) están gated por
    // `offline` en el player. Vaciar la caché hace que las vistas se recalculen
    // contra el catálogo local.
    if (get().offline) return;
    // Antes de vaciar la caché: vuelca al espejo lo último visto online (listas,
    // favoritos, álbumes), para que offline no muestre una copia vieja.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/api/data').snapshotCachesToMirror();
    } catch {
      // No bloquea el paso a offline.
    }
    await setItem(OFFLINE_KEY, '1');
    if (auto) await setItem(OFFLINE_AUTO_KEY, '1');
    else await deleteItem(OFFLINE_AUTO_KEY);
    queryClient.clear();
    set({ offline: true, autoOffline: auto });
  },

  goOnline: async () => {
    // Vuelta instantánea a la misma cuenta (auth intacto). La reproducción no se
    // toca; las vistas se recalculan contra el servidor al vaciar la caché.
    const current = get().auth;
    if (!get().offline || !current) return;
    // Antes de volver: vuelca al servidor lo que se hizo offline (favoritos…).
    // Best-effort; lo que falle se conserva para la próxima reconexión.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await require('@/api/data').flushOfflineQueue(current);
    } catch {
      // No bloquea la vuelta online.
    }
    await deleteItem(OFFLINE_KEY);
    await deleteItem(OFFLINE_AUTO_KEY);
    queryClient.clear();
    set({ offline: false, autoOffline: false });
  },

  setOfflineSource: async (source) => {
    if (source) {
      await setItem(OFFLINE_SOURCE_KEY, JSON.stringify(source));
      const name = offlineLabel(source);
      const prof: OfflineProfile = { _type: 'offline', name, source };
      // Si ya estábamos en un perfil local y solo cambiamos el origen, hay que
      // actualizar ese perfil en vez de dejar el viejo y crear uno nuevo.
      const prevSource = get().offlineSource;
      const profiles = [
        prof,
        ...get().profiles.filter((p) => {
          if (same(p, prof)) return false;
          if (
            p._type === 'offline' &&
            prevSource &&
            sameSource(p.source, prevSource)
          ) {
            return false;
          }
          return true;
        }),
      ];
      await setItem(PROFILES_KEY, JSON.stringify(profiles));
      clearLocalCatalog();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/lib/localQueries').clearLocalFavs();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/lib/localQueries').clearLocalPlaylists();
      queryClient.removeQueries({ queryKey: ['localSongs'] });
      queryClient.removeQueries({ queryKey: ['playlists'] });
      queryClient.removeQueries({ queryKey: ['starred'] });
      set({ offlineSource: source, profiles });
    } else {
      await deleteItem(OFFLINE_SOURCE_KEY);
      clearLocalCatalog();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/lib/localQueries').clearLocalFavs();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/lib/localQueries').clearLocalPlaylists();
      queryClient.removeQueries({ queryKey: ['localSongs'] });
      queryClient.removeQueries({ queryKey: ['playlists'] });
      queryClient.removeQueries({ queryKey: ['starred'] });
      set({ offlineSource: source });
    }
  },

  logout: async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await require('./player').usePlayerStore.getState().reset();
    await deleteItem(ACTIVE_KEY);
    await deleteItem(OFFLINE_KEY);
    await deleteItem(OFFLINE_AUTO_KEY);
    await deleteItem(OFFLINE_SOURCE_KEY);
    clearLocalCatalog();
    queryClient.clear();
    set({ auth: null, offline: false, autoOffline: false, offlineSource: null });
  },
}));
