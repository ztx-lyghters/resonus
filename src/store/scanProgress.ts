/**
 * Progreso del análisis del catálogo local (modo sin conexión). Lo actualizan
 * las funciones de carga de `localLibrary` mientras leen las etiquetas ID3 de
 * cada fichero, para poder mostrar un indicador con cuántas canciones se han
 * analizado en lugar de un spinner indefinido.
 *
 * Son tres fases, y `count` significa una cosa distinta en cada una:
 *
 *   - 'finding': buscar los ficheros. `count` son los encontrados hasta ahora y
 *     `total` es 0, porque aún no se sabe cuántos hay: no hay barra que llenar,
 *     pero un número subiendo ya dice que la cosa avanza. Antes esta fase no
 *     contaba nada y la pantalla se quedaba muerta hasta empezar a analizar.
 *   - 'reading': leer las etiquetas. `count` son las canciones ya leídas y la
 *     fracción llena la barra.
 *   - 'covers': leer las carátulas, una por álbum (ver `loadAlbumCovers`).
 *     `count` son los álbumes resueltos. Es corta, pero sin ella el final del
 *     escaneo era un silencio con la barra llena.
 */
import { create } from 'zustand';

export type ScanPhase = 'idle' | 'finding' | 'reading' | 'covers';

interface ScanProgressState {
  phase: ScanPhase;
  /** Ficheros encontrados, canciones leídas o álbumes resueltos, según la fase. */
  count: number;
  /** Total de la fase; 0 mientras aún se buscan los ficheros. */
  total: number;
  /** Arranca la búsqueda, cuando todavía no se sabe cuántos hay. */
  begin: () => void;
  /** Pasa a leer etiquetas, ya con el total conocido. */
  start: (total: number) => void;
  /** Pasa a leer carátulas, con el nº de álbumes que las necesitan. */
  startCovers: (total: number) => void;
  /** Suma `n` (agrupado por quien llama para no renderizar por fichero). */
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
