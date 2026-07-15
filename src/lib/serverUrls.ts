/**
 * Heurística de prioridad entre las URLs candidatas de un perfil. Al sondear
 * cuál usar (ver `store/autoUrl.ts`) probamos primero las de red local: en casa
 * gana la IP local (rápida, sin salir a internet) y, cuando deja de responder,
 * cae sola a la remota (dominio, Tailscale…). Así el usuario no tiene que
 * ordenar nada a mano.
 */

import type { SubsonicAuth } from '@/api/subsonic';

/**
 * URL principal del perfil (identidad estable). `serverUrl` es la URL ACTIVA y
 * cambia al conmutar de red; para claves de almacenamiento por perfil (cola,
 * descargas, historial…) hay que usar esta, no la activa, o se partirían.
 */
export function primaryUrl(auth: Pick<SubsonicAuth, 'urls' | 'serverUrl'>): string {
  return auth.urls?.[0] ?? auth.serverUrl;
}

function hostOf(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/:]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** ¿La URL apunta a una dirección de red local (LAN)? */
export function isLanUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  // Rangos privados RFC 1918 + loopback. Ojo: Tailscale (100.64.0.0/10) NO
  // cuenta como LAN a propósito: es alcanzable también por datos, así que debe
  // ir DESPUÉS de la LAN de verdad para que en casa se prefiera la local.
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * Copia ordenada por prioridad de sondeo: LAN primero, conservando el orden
 * relativo dentro de cada grupo (Array.sort es estable). No muta la entrada;
 * el orden guardado en el perfil sigue siendo el de inserción.
 */
export function byProbePriority(urls: string[]): string[] {
  return [...urls].sort((a, b) => Number(isLanUrl(b)) - Number(isLanUrl(a)));
}
