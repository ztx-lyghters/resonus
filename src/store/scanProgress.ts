/**
 * Local catalog scan progress (offline mode). Updated by the loading functions
 * in `localLibrary` while they read ID3 tags from each file, to show an
 * indicator of how many songs have been scanned instead of an indefinite
 * spinner.
 *
 * There are three phases, and `count` means something different in each:
 *
 *   - 'finding': searching for files. `count` is how many found so far and
 *     `total` is 0, because the total isn't known yet: there's no bar to fill,
 *     but a climbing number at least shows progress. Previously this phase
 *     counted nothing and the screen sat frozen until scanning began.
 *   - 'reading': reading tags. `count` is songs read so far and the fraction
 *     fills the bar.
 *   - 'covers': reading cover art, one per album (see `loadAlbumCovers`).
 *     `count` is albums resolved. It's short, but without it the end of the
 *     scan was silence with a full bar.
 */
import { create } from 'zustand';

export type ScanPhase = 'idle' | 'finding' | 'reading' | 'covers';

interface ScanProgressState {
  phase: ScanPhase;
  /** Files found, songs read, or albums resolved, depending on the phase. */
  count: number;
  /** Total for the phase; 0 while files are still being found. */
  total: number;
  /** Starts the search, when the total is not yet known. */
  begin: () => void;
  /** Transitions to reading tags, now with the total known. */
  start: (total: number) => void;
  /** Transitions to reading covers, with the number of albums that need them. */
  startCovers: (total: number) => void;
  /** Adds `n` (batched by caller to avoid re-rendering per file). */
  tick: (n?: number) => void;
  done: () => void;
}

export const useScanProgress = create<ScanProgressState>((set) => ({
  phase: 'idle',
  count: 0,
  total: 0,
  begin: () => set({ phase: 'finding', count: 0, total: 0 }),
  start: (total) => set({ phase: 'reading', count: 0, total }),
  startCovers: (total) => set({ phase: 'covers', count: 0, total }),
  tick: (n = 1) => set((s) => ({ count: s.count + n })),
  done: () => set({ phase: 'idle' }),
}));
