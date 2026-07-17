/**
 * Progreso del análisis del catálogo local (modo sin conexión). Lo actualizan
 * las funciones de carga de `localLibrary` mientras leen las etiquetas ID3 de
 * cada fichero, para poder mostrar un indicador con cuántas canciones se han
 * analizado en lugar de un spinner indefinido.
 *
 * Son dos fases, y `count` significa una cosa distinta en cada una:
 *
 *   1. Buscar los ficheros (`total` = 0): `count` son los encontrados hasta
 *      ahora. No se sabe cuántos hay, así que no hay barra que llenar, pero un
 *      número subiendo ya dice que la cosa avanza. Antes esta fase no contaba
 *      nada: la pantalla se quedaba muerta hasta que empezaba a analizar.
 *   2. Analizar (`total` > 0): `count` son las canciones ya leídas y la
 *      fracción llena la barra.
 */
import { create } from 'zustand';

interface ScanProgressState {
  scanning: boolean;
  /** Fase 1: ficheros encontrados. Fase 2: canciones analizadas. */
  count: number;
  /** Total a analizar; 0 mientras aún se buscan los ficheros. */
  total: number;
  /** Arranca la búsqueda, cuando todavía no se sabe cuántos hay. */
  begin: () => void;
  /** Pasa a analizar, ya con el total conocido. */
  start: (total: number) => void;
  /** Suma `n` (agrupado por quien llama para no renderizar por fichero). */
  tick: (n?: number) => void;
  done: () => void;
}

export const useScanProgress = create<ScanProgressState>((set) => ({
  scanning: false,
  count: 0,
  total: 0,
  begin: () => set({ scanning: true, count: 0, total: 0 }),
  start: (total) => set({ scanning: true, count: 0, total }),
  tick: (n = 1) => set((s) => ({ count: s.count + n })),
  done: () => set({ scanning: false }),
}));
