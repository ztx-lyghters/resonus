/**
 * Conmutación automática de la URL de servidor al cambiar de red.
 *
 * Un perfil puede tener varias URLs para la misma cuenta (IP local, dominio,
 * Tailscale…). Cuando cambia la conectividad —salir de casa: Wi-Fi → datos— se
 * sondea qué URL responde (las de red local primero) y se pone activa la
 * primera alcanzable. No se lee el SSID de la Wi-Fi (evita pedir permiso de
 * ubicación): nos guiamos por quién responde, que basta porque la IP local solo
 * es alcanzable en casa.
 */
import * as Network from 'expo-network';

import { reachable } from '@/api/backend';
import { byProbePriority } from '@/lib/serverUrls';
import { useAuthStore } from './auth';

let started = false;
let checking = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Sondea las URLs del perfil activo y conmuta a la primera alcanzable. */
async function check(): Promise<void> {
  if (checking) return;
  const auth = useAuthStore.getState().auth;
  const urls = auth?.urls ?? [];
  // Solo tiene sentido con conmutación activada y más de una URL candidata.
  if (!auth || !auth.autoUrl || urls.length < 2) return;
  checking = true;
  try {
    for (const url of byProbePriority(urls)) {
      if (await reachable(auth, url)) {
        // Puede haber cambiado el perfil mientras sondeábamos: revalida.
        const now = useAuthStore.getState().auth;
        if (now && now.autoUrl && now.serverUrl !== url && now.urls?.includes(url)) {
          await useAuthStore.getState().setActiveUrl(url);
        }
        return;
      }
    }
  } finally {
    checking = false;
  }
}

/** Reprograma el sondeo tras un respiro (el handoff Wi-Fi→datos tarda en asentarse). */
function schedule(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void check(), 1500);
}

/** Arranca el watcher (idempotente; desde el layout raíz, tras hidratar). */
export function initAutoUrl(): void {
  if (started) return;
  started = true;
  Network.addNetworkStateListener(() => schedule());
  // Comprobación inicial (al abrir la app ya podemos no estar en casa).
  schedule();
}

/** Fuerza un sondeo ahora (p. ej. al activar la conmutación en Ajustes). */
export function checkAutoUrlNow(): void {
  schedule();
}
