/**
 * Modo Jukebox de Subsonic: el servidor reproduce por su propio hardware de
 * audio (altavoces/DAC) y la app hace de mando a distancia. No se stremea nada
 * al teléfono; solo se envían comandos `jukeboxControl` al servidor.
 *
 * Reutiliza la maquinaria remota del player (los mismos `RemoteEvents` que
 * UPnP): la cola sigue viviendo en el store del player, así que autoplay,
 * mixes, shuffle y reordenar funcionan igual. Aquí controlamos UNA pista cada
 * vez (`set` + `start`) y sondeamos el estado del servidor, que es quien lleva
 * el reloj; el fin de pista se deduce de un "parado cerca del final", como en
 * UPnP.
 *
 * Limitación conocida: el sondeo es un `setInterval` de JS, que Android congela
 * en segundo plano. Con la app minimizada el avance de la cola se pausa hasta
 * volver a abrirla (el servidor termina la pista actual y espera). Pensado para
 * usarse con la app delante, de mando.
 *
 * Solo servidores Subsonic con el rol jukebox habilitado por el admin.
 */
import { create } from 'zustand';

import { type Song } from '@/api/backend';
import {
  hasJukeboxRole,
  jukeboxSet,
  jukeboxSetGain,
  jukeboxSkip,
  jukeboxStart,
  jukeboxStatus,
  jukeboxStop,
  type SubsonicAuth,
} from '@/api/subsonic';
import { useAuthStore } from './auth';
import type { RemoteEvents } from './upnp';

interface JukeboxStoreState {
  /** Sesión jukebox en curso (el servidor es la salida activa). */
  active: boolean;
  /** El servidor soporta jukebox para este usuario (rol habilitado). */
  available: boolean;
}

export const useJukebox = create<JukeboxStoreState>(() => ({
  active: false,
  available: false,
}));

const POLL_MS = 1000;

let events: RemoteEvents | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPositionSec = 0;
let lastDurationSec = 0;
/** Evita avanzar la cola dos veces por el mismo fin de pista. */
let finishedFired = false;
/** Ignora el estado "parado" mientras cargamos otra pista. */
let loading = false;
/** Distingue una pausa del usuario de un fin natural de pista. */
let intendedPlaying = false;
/** Solo emitimos onPlayingChanged al cambiar de verdad (el sondeo es continuo). */
let lastPlaying: boolean | null = null;

export function isJukeboxActive(): boolean {
  return useJukebox.getState().active;
}

/** Registra los eventos del player. Llamar una sola vez (desde el player). */
export function initJukebox(ev: RemoteEvents): void {
  events = ev;
}

/** Solo Subsonic tiene `jukeboxControl` (Jellyfin usa otra API). */
function auth(): SubsonicAuth | null {
  const a = useAuthStore.getState().auth;
  if (!a || a.serverType === 'jellyfin') return null;
  return a;
}

/** Comprueba si el servidor ofrece jukebox y lo cachea en el store. */
export async function refreshJukeboxAvailability(): Promise<void> {
  const a = auth();
  if (!a) {
    useJukebox.setState({ available: false });
    return;
  }
  const ok = await hasJukeboxRole(a);
  useJukebox.setState({ available: ok });
}

async function poll() {
  const a = auth();
  if (!a || !isJukeboxActive()) return;
  let st;
  try {
    st = await jukeboxStatus(a);
  } catch {
    return; // un fallo puntual de red no corta la sesión
  }
  if (!isJukeboxActive()) return;
  const pos = st.position;
  if (pos > 0) lastPositionSec = pos;
  if (st.playing) {
    loading = false;
    finishedFired = false;
    events?.onProgress(pos, lastDurationSec);
    if (lastPlaying !== true) {
      lastPlaying = true;
      events?.onPlayingChanged(true, false);
    }
    return;
  }
  // Parado: fin natural (cerca del final y queríamos reproducir) o pausa.
  events?.onProgress(pos, lastDurationSec);
  if (
    intendedPlaying &&
    !finishedFired &&
    !loading &&
    lastDurationSec > 0 &&
    lastPositionSec >= lastDurationSec - 3
  ) {
    finishedFired = true;
    events?.onFinished();
    return;
  }
  if (lastPlaying !== false) {
    lastPlaying = false;
    events?.onPlayingChanged(false, false);
  }
}

/** Abre la sesión jukebox y arranca el sondeo de estado. */
export async function jukeboxConnect(): Promise<boolean> {
  const a = auth();
  if (!a) return false;
  lastPositionSec = 0;
  lastDurationSec = 0;
  finishedFired = false;
  loading = false;
  intendedPlaying = false;
  lastPlaying = null;
  useJukebox.setState({ active: true });
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => void poll(), POLL_MS);
  events?.onConnected();
  return true;
}

/** Cierra la sesión; con `silent` no avisa al player (al cambiar de salida). */
export async function jukeboxDisconnect(silent = false): Promise<void> {
  if (!isJukeboxActive()) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  useJukebox.setState({ active: false });
  const a = auth();
  try {
    if (a) await jukeboxStop(a);
  } catch {
    // ignore
  }
  if (!silent) events?.onDisconnected(lastPositionSec);
}

/**
 * Carga una pista en el jukebox del servidor. Devuelve false si no hay sesión o
 * la pista no vale para jukebox (radios y ficheros locales: el servidor solo
 * reproduce por id de su propia biblioteca).
 */
export async function jukeboxLoad(song: Song, autoplay: boolean, startSec = 0): Promise<boolean> {
  const a = auth();
  if (!a || !isJukeboxActive()) return false;
  if (song.url || song.localUri) return false;
  loading = true;
  finishedFired = false;
  intendedPlaying = autoplay;
  lastPlaying = null;
  lastPositionSec = startSec;
  lastDurationSec = song.duration ?? 0;
  try {
    await jukeboxSet(a, song.id);
    if (startSec > 0) await jukeboxSkip(a, 0, startSec);
    if (autoplay) await jukeboxStart(a);
    else await jukeboxStop(a);
    loading = false;
    return true;
  } catch {
    loading = false;
    return false;
  }
}

export async function jukeboxPlay(): Promise<void> {
  const a = auth();
  if (!a) return;
  intendedPlaying = true;
  try {
    await jukeboxStart(a);
  } catch {
    // ignore
  }
}

export async function jukeboxPause(): Promise<void> {
  const a = auth();
  if (!a) return;
  intendedPlaying = false;
  try {
    await jukeboxStop(a);
  } catch {
    // ignore
  }
}

export async function jukeboxSeek(sec: number): Promise<void> {
  const a = auth();
  if (!a) return;
  lastPositionSec = sec;
  try {
    await jukeboxSkip(a, 0, sec);
  } catch {
    // ignore
  }
}

/** Volumen del jukebox; el slider de la app va 0..1 y el gain de Subsonic igual. */
export function jukeboxSetVolume(volume: number): void {
  const a = auth();
  if (!a) return;
  try {
    void jukeboxSetGain(a, Math.max(0, Math.min(1, volume)));
  } catch {
    // ignore
  }
}
