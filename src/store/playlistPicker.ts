/**
 * Global playlist picker for "Add to playlist". Any place (album/artist menu,
 * queue…) opens the sheet with a batch of songs without having to render its
 * own instance. The sheet (`PlaylistPickerSheet`) is mounted once in the root
 * layout and reads from here.
 */
import { create } from 'zustand';

import { type Song } from '@/api/subsonic';

interface PlaylistPickerState {
  /** Songs to add; null = sheet closed. */
  songs: Song[] | null;
  open: (songs: Song[]) => void;
  close: () => void;
}

export const usePlaylistPicker = create<PlaylistPickerState>((set) => ({
  songs: null,
  open: (songs) => set({ songs }),
  close: () => set({ songs: null }),
}));
