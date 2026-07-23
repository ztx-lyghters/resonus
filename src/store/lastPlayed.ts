/**
 * Last time each source was played (album/playlist/artist), key = its
 * `sourceHref` ('/album/x', '/playlist/y'…). Feeds the "Recent" sort order in
 * the Library, Spotify style: what you last listened to, at the top.
 */
import { create } from 'zustand';

import { getItem, setItem } from '@/lib/storage';

const KEY = 'resonus.lastPlayed';
const MAX = 300;

interface LastPlayedState {
  /** sourceHref → timestamp (ms) of the last play. */
  times: Record<string, number>;
  touch: (href: string) => void;
  hydrate: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(times: Record<string, number>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void setItem(KEY, JSON.stringify(times));
  }, 1000);
}

export const useLastPlayed = create<LastPlayedState>((set, get) => ({
  times: {},

  touch: (href) => {
    let entries = Object.entries({ ...get().times, [href]: Date.now() });
    // Bounded: if it grows too large, drop the oldest ones.
    if (entries.length > MAX) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX);
    }
    const times = Object.fromEntries(entries);
    set({ times });
    scheduleSave(times);
  },

  hydrate: async () => {
    try {
      const raw = await getItem(KEY);
      if (raw) set({ times: JSON.parse(raw) as Record<string, number> });
    } catch {
      // no previous data
    }
  },
}));
