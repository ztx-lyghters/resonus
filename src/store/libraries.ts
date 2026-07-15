/**
 * Bibliotecas del servidor (Navidrome multi-library) y qué carpetas mostrar.
 *
 * Navidrome expone cada "library" como un music folder del API Subsonic
 * (`getMusicFolders`). Aquí guardamos, por perfil, la lista de carpetas y las
 * que el usuario ha DESACTIVADO (guardamos las desactivadas para que una
 * biblioteca nueva en el servidor aparezca activada por defecto).
 *
 * El filtro se aplica en `data.ts`: sin desactivadas o con una sola biblioteca
 * no se filtra; con una activa se pasa su `musicFolderId`; con un subconjunto
 * se piden por separado y se fusionan (el API solo filtra por una a la vez).
 */
import { create } from 'zustand';

import { getMusicFolders, type MusicFolder, type SubsonicAuth } from '@/api/backend';
import { queryClient } from '@/lib/query';
import { primaryUrl } from '@/lib/serverUrls';
import { getItem, setItem } from '@/lib/storage';

const STORAGE_KEY = 'resonus.libraries';

/** Identifica un perfil de servidor (los ids de biblioteca son por servidor). */
export function profileKeyOf(auth: SubsonicAuth | null | undefined): string | null {
  if (!auth || auth.serverType === 'jellyfin') return null;
  // URL principal, no la activa: al conmutar de red no debe verse como otro perfil.
  return `${primaryUrl(auth)}|${auth.username}`;
}

interface LibrariesState {
  /** Carpetas conocidas por perfil (persistido para filtrar tras reiniciar). */
  folders: Record<string, MusicFolder[]>;
  /** Ids de carpeta desactivados por perfil. */
  disabled: Record<string, string[]>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Refresca desde el servidor la lista de bibliotecas del perfil. */
  load: (auth: SubsonicAuth) => Promise<void>;
  /** Activa/desactiva una biblioteca del perfil activo. */
  setEnabled: (auth: SubsonicAuth, id: string, enabled: boolean) => void;
}

function persist(get: () => LibrariesState) {
  const { folders, disabled } = get();
  void setItem(STORAGE_KEY, JSON.stringify({ folders, disabled }));
}

export const useLibraries = create<LibrariesState>((set, get) => ({
  folders: {},
  disabled: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          folders: Record<string, MusicFolder[]>;
          disabled: Record<string, string[]>;
        }>;
        set({
          folders: parsed.folders ?? {},
          disabled: parsed.disabled ?? {},
        });
      }
    } catch {
      // se quedará con los valores por defecto (todo visible)
    } finally {
      set({ hydrated: true });
    }
  },

  load: async (auth) => {
    const key = profileKeyOf(auth);
    if (!key) return;
    try {
      const list = await getMusicFolders(auth);
      set((s) => ({ folders: { ...s.folders, [key]: list } }));
      // Purga de desactivadas que ya no existen en el servidor.
      const ids = new Set(list.map((f) => f.id));
      const cur = get().disabled[key] ?? [];
      const cleaned = cur.filter((id) => ids.has(id));
      if (cleaned.length !== cur.length) {
        set((s) => ({ disabled: { ...s.disabled, [key]: cleaned } }));
      }
      persist(get);
    } catch {
      // sin conexión / servidor sin soporte: se conserva lo que hubiera
    }
  },

  setEnabled: (auth, id, enabled) => {
    const key = profileKeyOf(auth);
    if (!key) return;
    const cur = get().disabled[key] ?? [];
    const next = enabled ? cur.filter((x) => x !== id) : [...cur, id];
    set((s) => ({ disabled: { ...s.disabled, [key]: next } }));
    persist(get);
    // El filtro cambió: tira las listas cacheadas para que se repidan.
    clearAlbumCache();
    void queryClient.invalidateQueries();
  },
}));

// ── Ayudas para la capa de datos (sin React) ──

/** Carpetas conocidas del perfil (vacío si aún no se han cargado). */
export function foldersFor(auth: SubsonicAuth | null | undefined): MusicFolder[] {
  const key = profileKeyOf(auth);
  if (!key) return [];
  return useLibraries.getState().folders[key] ?? [];
}

/**
 * Ids de biblioteca a consultar, o `undefined` cuando no hay que filtrar
 * (Jellyfin/offline, una sola biblioteca, o todas activas).
 */
export function enabledFolderIds(auth: SubsonicAuth | null | undefined): string[] | undefined {
  const key = profileKeyOf(auth);
  if (!key) return undefined;
  const folders = useLibraries.getState().folders[key] ?? [];
  if (folders.length < 2) return undefined;
  const disabled = new Set(useLibraries.getState().disabled[key] ?? []);
  if (disabled.size === 0) return undefined;
  const enabled = folders.map((f) => f.id).filter((id) => !disabled.has(id));
  // Si quedaran todas activas (nada desactivado válido) → sin filtro.
  if (enabled.length === 0 || enabled.length === folders.length) return undefined;
  return enabled;
}

// ── Caché de listas de álbumes fusionadas (solo modo subconjunto) ──
//
// El API pagina por carpeta, así que para varias bibliotecas mezcladas se trae
// la lista completa de cada una, se fusiona y se sirve por trozos. Se cachea en
// memoria un rato para no repetir el trabajo en cada página del scroll infinito.

const CACHE_TTL_MS = 5 * 60 * 1000;
const albumCache = new Map<string, { at: number; albums: unknown[] }>();

export function readAlbumCache<T>(cacheKey: string): T[] | null {
  const hit = albumCache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    albumCache.delete(cacheKey);
    return null;
  }
  return hit.albums as T[];
}

export function writeAlbumCache<T>(cacheKey: string, albums: T[]): void {
  albumCache.set(cacheKey, { at: Date.now(), albums: albums as unknown[] });
}

export function clearAlbumCache(): void {
  albumCache.clear();
}
