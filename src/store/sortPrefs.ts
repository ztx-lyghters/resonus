/**
 * Preferencia de orden (campo + dirección) por lista, persistida en disco.
 * La clave identifica la lista ('favorites', 'playlist:<id>'…); el orden por
 * defecto no se guarda para que el mapa solo contenga lo que el usuario cambió.
 */
import { create } from 'zustand';

import { getItem, setItem } from '@/lib/storage';

const KEY = 'resonus.sortPrefs';

export type SortField = 'recent' | 'added' | 'alpha' | 'artist' | 'album' | 'downloaded';
export type SortDir = 'asc' | 'desc';

export interface SortPref {
  field: SortField;
  dir: SortDir;
}

export const DEFAULT_SORT: SortPref = { field: 'recent', dir: 'asc' };

interface SortPrefsState {
  prefs: Record<string, SortPref>;
  hydrated: boolean;
  /** `def` = orden por defecto de esa lista (para omitirlo del mapa si coincide). */
  setPref: (key: string, pref: SortPref, def?: SortPref) => void;
  hydrate: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(prefs: Record<string, SortPref>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void setItem(KEY, JSON.stringify(prefs));
  }, 1000);
}

export const useSortPrefs = create<SortPrefsState>((set, get) => ({
  prefs: {},
  hydrated: false,

  setPref: (key, pref, def = DEFAULT_SORT) => {
    const prefs = { ...get().prefs };
    // Solo se omite del mapa si coincide con el default REAL de esa lista (que
    // en playlists no es el global): si no, seleccionar el orden que casualmente
    // igualaba el global se leía como "volver al default" y no se guardaba.
    if (pref.field === def.field && pref.dir === def.dir) delete prefs[key];
    else prefs[key] = pref;
    set({ prefs });
    scheduleSave(prefs);
  },

  hydrate: async () => {
    try {
      const raw = await getItem(KEY);
      set({ prefs: raw ? (JSON.parse(raw) as Record<string, SortPref>) : {}, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
