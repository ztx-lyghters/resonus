/**
 * Elementos anclados de la Biblioteca (estilo Spotify): hasta 4, siempre
 * arriba del todo ignorando el orden elegido. Clave = 'playlist:<id>' o
 * 'album:<id>'; el valor es cuándo se fijó (los pins conservan ese orden).
 */
import { create } from 'zustand';

import { hashKey } from '@/lib/localLibrary';
import { getItem, setItem } from '@/lib/storage';
import { profileScopeId } from '@/store/auth';

// Los pins son POR PERFIL (cada cuenta/perfil los suyos): una playlist local
// fijada no debe aparecer en el Home de una cuenta de servidor y viceversa. Se
// guardan bajo `resonus.pins.<hash del perfil>`; la clave base a secas es la de
// la versión antigua (compartida), que solo hereda el perfil local (migración).
const KEY = 'resonus.pins';
/** Clave de pins del perfil activo. */
function pinsKey(): string {
  return `${KEY}.${hashKey(profileScopeId())}`;
}
export const MAX_PINS = 4;

interface PinsState {
  pins: Record<string, number>;
  /** Fija/desfija. Devuelve false si no cabe (ya hay MAX_PINS). */
  toggle: (key: string) => boolean;
  hydrate: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(pins: Record<string, number>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void setItem(pinsKey(), JSON.stringify(pins));
  }, 1000);
}

export const usePins = create<PinsState>((set, get) => ({
  pins: {},

  toggle: (key) => {
    const pins = { ...get().pins };
    if (pins[key]) {
      delete pins[key];
    } else {
      if (Object.keys(pins).length >= MAX_PINS) return false;
      pins[key] = Date.now();
    }
    set({ pins });
    scheduleSave(pins);
    return true;
  },

  hydrate: async () => {
    // Se re-ejecuta al cambiar de perfil: hay que RESETEAR a {} si el nuevo
    // perfil no tiene pins, o se quedarían en memoria los del perfil anterior.
    try {
      const raw =
        (await getItem(pinsKey())) ??
        (profileScopeId() === 'local' ? await getItem(KEY) : null);
      set({ pins: raw ? (JSON.parse(raw) as Record<string, number>) : {} });
    } catch {
      set({ pins: {} });
    }
  },
}));
