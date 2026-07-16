/**
 * Ecualizador (módulo nativo modules/audio-eq, Android).
 *
 * El procesado lo hace el framework de Android; aquí solo guardamos el estado
 * (activado + ganancia por banda) y se lo pasamos al efecto nativo. El player
 * llama a `attach` con el id de sesión de cada AudioPlayer que crea (usa dos
 * alternos para el crossfade), así el ecualizador se aplica a todos.
 *
 * Las ganancias van en milibelios (100 mB = 1 dB), que es la unidad de
 * android.media.audiofx.Equalizer.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { create } from 'zustand';

import { getItem, setItem } from '@/lib/storage';

const KEY = 'resonus.equalizer';

/** Una banda del ecualizador del dispositivo. */
export interface EqBand {
  index: number;
  /** Frecuencia central en Hz. */
  centerFreq: number;
}

/** Capacidades del ecualizador del dispositivo. */
interface EqInfo {
  supported: boolean;
  bands?: EqBand[];
  /** Rango de ganancia en milibelios. */
  minLevel?: number;
  maxLevel?: number;
  presets?: string[];
}

interface NativeAudioEq {
  getInfo: () => EqInfo;
  attach: (sessionId: number) => void;
  detach: (sessionId: number) => void;
  setEnabled: (on: boolean) => void;
  setBandLevels: (millibels: number[]) => void;
  setBandLevel: (band: number, millibels: number) => void;
  usePreset: (preset: number) => number[];
  getBandLevels: () => number[];
}

// Opcional: en un build sin el módulo (o iOS) simplemente no hay ecualizador.
const native = requireOptionalNativeModule<NativeAudioEq>('AudioEq');

interface Stored {
  enabled: boolean;
  levels: number[];
}

interface EqState {
  /** El dispositivo expone ecualizador y el módulo está presente. */
  supported: boolean;
  bands: EqBand[];
  minLevel: number;
  maxLevel: number;
  presets: string[];
  enabled: boolean;
  /** Ganancia por banda en milibelios. */
  levels: number[];
  hydrate: () => Promise<void>;
  /** Engancha el ecualizador a la sesión de un player (lo llama el player). */
  attach: (sessionId: number) => void;
  detach: (sessionId: number) => void;
  setEnabled: (on: boolean) => void;
  setBandLevel: (band: number, millibels: number) => void;
  /** Aplica un preset del dispositivo (no se llama `usePreset` para que no
   *  parezca un hook de React). */
  applyPreset: (preset: number) => void;
  /** Deja todas las bandas a 0 dB. */
  reset: () => void;
}

function persist(s: Pick<EqState, 'enabled' | 'levels'>) {
  const data: Stored = { enabled: s.enabled, levels: s.levels };
  void setItem(KEY, JSON.stringify(data));
}

export const useEqualizer = create<EqState>((set, get) => ({
  supported: false,
  bands: [],
  minLevel: -1500,
  maxLevel: 1500,
  presets: [],
  enabled: false,
  levels: [],

  hydrate: async () => {
    if (!native) return;
    const info = native.getInfo();
    if (!info.supported || !info.bands?.length) {
      set({ supported: false });
      return;
    }
    // Estado guardado; si no cuadra con las bandas del móvil, se ignora.
    let stored: Stored | null = null;
    try {
      const raw = await getItem(KEY);
      if (raw) stored = JSON.parse(raw) as Stored;
    } catch {
      // sin datos previos
    }
    const flat = info.bands.map(() => 0);
    const levels =
      stored && Array.isArray(stored.levels) && stored.levels.length === info.bands.length
        ? stored.levels
        : flat;
    const enabled = !!stored?.enabled;
    set({
      supported: true,
      bands: info.bands,
      minLevel: info.minLevel ?? -1500,
      maxLevel: info.maxLevel ?? 1500,
      presets: info.presets ?? [],
      enabled,
      levels,
    });
    // Vuelca lo guardado al efecto nativo (las sesiones ya enganchadas, si las
    // hay, lo cogen; las futuras lo reciben al engancharse).
    native.setBandLevels(levels);
    native.setEnabled(enabled);
  },

  attach: (sessionId) => {
    if (!native || !get().supported) return;
    native.attach(sessionId);
  },

  detach: (sessionId) => {
    if (!native) return;
    native.detach(sessionId);
  },

  setEnabled: (on) => {
    if (!native) return;
    native.setEnabled(on);
    set({ enabled: on });
    persist({ enabled: on, levels: get().levels });
  },

  setBandLevel: (band, millibels) => {
    if (!native) return;
    native.setBandLevel(band, millibels);
    const levels = get().levels.slice();
    levels[band] = millibels;
    set({ levels });
    persist({ enabled: get().enabled, levels });
  },

  applyPreset: (preset) => {
    if (!native) return;
    // El preset lo aplica el sistema: nos devuelve las ganancias resultantes
    // para que los sliders muestren lo que de verdad hay puesto.
    const levels = native.usePreset(preset);
    set({ levels });
    persist({ enabled: get().enabled, levels });
  },

  reset: () => {
    if (!native) return;
    const levels = get().bands.map(() => 0);
    native.setBandLevels(levels);
    set({ levels });
    persist({ enabled: get().enabled, levels });
  },
}));
