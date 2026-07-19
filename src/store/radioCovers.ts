/**
 * Carátulas personalizadas de emisoras de radio, guardadas SOLO en el
 * dispositivo: Subsonic/Navidrome no tiene API de carátula para emisoras, así
 * que la imagen elegida se copia a un directorio propio y se mapea por id de
 * emisora. Es POR PERFIL (cada cuenta ve sus emisoras): misma lógica que los
 * pins. La copia vive fuera de local-catalog/, que "Volver a escanear" borra.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import { hashKey } from '@/lib/localLibrary';
import { getItem, setItem } from '@/lib/storage';
import { profileScopeId } from '@/store/auth';

const KEY = 'resonus.radioCovers';
/** Clave de carátulas del perfil activo. */
function coversKey(): string {
  return `${KEY}.${hashKey(profileScopeId())}`;
}

const COVERS_DIR = FileSystem.documentDirectory + 'radio-covers/';

function deleteCoverFile(uri?: string) {
  if (uri) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

interface RadioCoversState {
  covers: Record<string, string>;
  hydrate: () => Promise<void>;
  setCover: (id: string, srcUri: string) => Promise<void>;
  removeCover: (id: string) => Promise<void>;
}

export const useRadioCovers = create<RadioCoversState>((set, get) => ({
  covers: {},

  hydrate: async () => {
    // Se re-ejecuta al cambiar de perfil: hay que RESETEAR a {} si el nuevo
    // perfil no tiene carátulas, o quedarían las del perfil anterior.
    try {
      const raw = await getItem(coversKey());
      set({ covers: raw ? (JSON.parse(raw) as Record<string, string>) : {} });
    } catch {
      set({ covers: {} });
    }
  },

  setCover: async (id, srcUri) => {
    await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true }).catch(() => {});
    // Nombre nuevo en cada cambio: reusar la misma URI dejaría a expo-image
    // enseñando la imagen anterior cacheada.
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dest = `${COVERS_DIR}${safe}-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    const covers = { ...get().covers };
    deleteCoverFile(covers[id]);
    covers[id] = dest;
    set({ covers });
    await setItem(coversKey(), JSON.stringify(covers));
  },

  removeCover: async (id) => {
    const covers = { ...get().covers };
    if (!covers[id]) return;
    deleteCoverFile(covers[id]);
    delete covers[id];
    set({ covers });
    await setItem(coversKey(), JSON.stringify(covers));
  },
}));
