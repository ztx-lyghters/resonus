/**
 * Sesión de medios para el modo casting (módulo nativo `modules/cast-media`).
 *
 * Mientras se castea por UPnP no suena audio local, así que la MediaSession de
 * expo-audio no puede dar controles de bloqueo ni capturar los botones de
 * volumen. Este módulo mantiene una sesión propia (notificación + volumen
 * remoto) durante el cast: aquí solo empujamos metadatos/estado y recibimos los
 * controles que el usuario pulsa, que el player enruta al renderer.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

const native = requireOptionalNativeModule('CastMedia');

export const castMediaAvailable = !!native;

export interface CastNowPlaying {
  title?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  durationMs: number;
  positionMs: number;
  isPlaying: boolean;
}

let sub: { remove: () => void } | undefined;
let handler: ((action: string, value?: number) => void) | null = null;

/** Registra el manejador de controles (play/pausa/next/prev/seek/volumen). */
export function initCastMedia(fn: (action: string, value?: number) => void): void {
  handler = fn;
  if (!native || sub) return;
  sub = native.addListener('command', (e: { action: string; value?: number }) => {
    handler?.(e.action, e.value);
  });
}

function payload(info: CastNowPlaying): string {
  return JSON.stringify({
    title: info.title ?? '',
    artist: info.artist ?? '',
    album: info.album ?? '',
    artworkUrl: info.artworkUrl ?? '',
    durationMs: Math.max(0, Math.round(info.durationMs)),
    positionMs: Math.max(0, Math.round(info.positionMs)),
    isPlaying: info.isPlaying,
  });
}

/** Arranca la sesión con la pista actual (idempotente: si ya está, actualiza). */
export function castStart(info: CastNowPlaying): void {
  try {
    native?.start(payload(info));
  } catch {
    // ignore
  }
}

/** Refresca metadatos + estado al cambiar de pista. */
export function castUpdate(info: CastNowPlaying): void {
  try {
    native?.update(payload(info));
  } catch {
    // ignore
  }
}

/** Refresca solo el estado de reproducción (play/pausa + progreso). */
export function castSetState(isPlaying: boolean, positionMs: number): void {
  try {
    native?.setState(isPlaying, Math.max(0, Math.round(positionMs)));
  } catch {
    // ignore
  }
}

/** Cierra la sesión y retira la notificación. */
export function castStop(): void {
  try {
    native?.stop();
  } catch {
    // ignore
  }
}
