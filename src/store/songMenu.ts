/** Estado del menú contextual de canción (la hoja inferior con acciones). */
import { create } from 'zustand';

import { type Song } from '@/api/subsonic';

/** Contexto opcional: si la canción se abre desde una playlist editable. */
export interface SongMenuContext {
  playlistId: string;
  /** Posición de la canción dentro de la playlist (para quitarla). */
  index: number;
}

/** Ajustes extra al abrir el menú (p. ej. desde el reproductor). */
export interface SongMenuOptions {
  /** Muestra la acción «Letra». Solo desde el reproductor: /lyrics abre la
   *  canción en curso, no la de una fila cualquiera. */
  showLyrics?: boolean;
}

interface SongMenuState {
  song: Song | null;
  context: SongMenuContext | null;
  showLyrics: boolean;
  open: (song: Song, context?: SongMenuContext, opts?: SongMenuOptions) => void;
  close: () => void;
}

export const useSongMenu = create<SongMenuState>((set) => ({
  song: null,
  context: null,
  showLyrics: false,
  open: (song, context, opts) =>
    set({ song, context: context ?? null, showLyrics: !!opts?.showLyrics }),
  close: () => set({ song: null, context: null, showLyrics: false }),
}));
