/**
 * Equalizer (native module modules/audio-eq, Android).
 *
 * Processing is handled by the Android framework; here we only store the state
 * (enabled + per-band gain) and pass it to the native effect. The player calls
 * `attach` with the session id of each AudioPlayer it creates (it uses two
 * alternating ones for crossfade), so the equalizer applies to all.
 *
 * Gains are in millibels (100 mB = 1 dB), which is the unit of
 * android.media.audiofx.Equalizer.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { create } from 'zustand';

import { getItem, setItem } from '@/lib/storage';

const KEY = 'resonus.equalizer';

/** A band of the device's equalizer. */
export interface EqBand {
  index: number;
  /** Center frequency in Hz. */
  centerFreq: number;
}

/** Capabilities of the device's equalizer. */
interface EqInfo {
  supported: boolean;
  bands?: EqBand[];
  /** Gain range in millibels. */
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

// Optional: in a build without the module (or iOS) there is simply no equalizer.
const native = requireOptionalNativeModule<NativeAudioEq>('AudioEq');

interface Stored {
  enabled: boolean;
  levels: number[];
}

interface EqState {
  /** The device exposes an equalizer and the module is present. */
  supported: boolean;
  bands: EqBand[];
  minLevel: number;
  maxLevel: number;
  presets: string[];
  enabled: boolean;
  /** Per-band gain in millibels. */
  levels: number[];
  hydrate: () => Promise<void>;
  /** Attaches the equalizer to a player's audio session (called by the player). */
  attach: (sessionId: number) => void;
  detach: (sessionId: number) => void;
  setEnabled: (on: boolean) => void;
  setBandLevel: (band: number, millibels: number) => void;
  /** Applies a device preset (not named `usePreset` so it doesn't look like a
   *  React hook). */
  applyPreset: (preset: number) => void;
  /** Resets all bands to 0 dB. */
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
    // Saved state; if it doesn't match the device's bands, it's ignored.
    let stored: Stored | null = null;
    try {
      const raw = await getItem(KEY);
      if (raw) stored = JSON.parse(raw) as Stored;
    } catch {
      // no previous data
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
    // Dumps saved state to the native effect (already attached sessions, if any,
    // pick it up; future ones receive it on attach).
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
    // The system applies the preset: it returns the resulting gains so the
    // sliders show what's actually set.
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
