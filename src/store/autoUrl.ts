/**
 * Fiabilidad de red del perfil de servidor: conmutación de URL y caída a modo
 * offline, ambas automáticas al cambiar la conectividad.
 *
 * Un perfil puede tener varias URLs para la misma cuenta (IP local, dominio,
 * Tailscale…). Al cambiar la red —salir de casa: Wi-Fi → datos— se sondea qué
 * URL responde (las de red local primero) y se pone activa la primera
 * alcanzable. No se lee el SSID de la Wi-Fi (evita pedir permiso de ubicación):
 * nos guiamos por quién responde, que basta porque la IP local solo es
 * alcanzable en casa.
 *
 * Además, si NINGUNA URL responde y el usuario tiene descargas, se cae solo a
 * modo offline (mostrar/reproducir descargas) sin que tenga que hacer nada; y
 * cuando el servidor vuelve a responder, se reconecta solo. Así las descargas
 * "simplemente funcionan" sin gestionar modos. Un offline manual no se revierte
 * (solo se auto-reconecta lo que se activó solo: `autoOffline`).
 */
import * as Network from 'expo-network';

import { reachable } from '@/api/backend';
import { tg } from '@/i18n';
import { byProbePriority } from '@/lib/serverUrls';
import { useAuthStore } from './auth';
import { hasDownloads } from './downloads';
import { useToast } from './toast';

let started = false;
let checking = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
/**
 * Sondeos fallidos seguidos. Exigimos 2 antes de caer a offline: un único fallo
 * puede ser un hipo de red (handoff Wi-Fi↔datos, DNS lento…), y no queremos
 * cambiar de modo por eso. Se reinicia en cuanto el servidor responde.
 */
let consecutiveFails = 0;

/**
 * Sondea las URLs del perfil activo y actúa: conmuta a la primera alcanzable,
 * reconecta si habíamos caído a offline solos, o cae a offline si nada responde.
 */
async function check(): Promise<void> {
  if (checking) return;
  const auth = useAuthStore.getState().auth;
  // Sin cuenta de servidor (deslogueado o perfil local) no hay nada que sondear.
  if (!auth) return;
  const urls = auth.urls ?? [auth.serverUrl];
  checking = true;
  try {
    let up: string | null = null;
    for (const url of byProbePriority(urls)) {
      if (await reachable(auth, url)) {
        up = url;
        break;
      }
    }
    // Pudo cambiar el perfil mientras sondeábamos: revalida contra el estado vivo.
    const now = useAuthStore.getState();
    if (!now.auth) return;
    if (up) {
      consecutiveFails = 0;
      if (now.autoOffline) {
        // Habíamos caído a offline solos: el servidor volvió → reconecta.
        // Primero online, luego (si toca) fija la URL alcanzable, ya en contexto
        // online para que la recarga de la pista opere bien.
        await now.goOnline();
        if (up !== now.auth.serverUrl && now.auth.urls?.includes(up)) {
          await now.setActiveUrl(up);
        }
        // Aviso cruzado (se ve en cualquier pantalla, no solo en Inicio).
        useToast.getState().show(tg('Back online'));
      } else if (
        !now.offline &&
        now.auth.autoUrl &&
        urls.length >= 2 &&
        up !== now.auth.serverUrl &&
        now.auth.urls?.includes(up)
      ) {
        // Conmutación de URL normal (misma red distinta: local ↔ remota).
        await now.setActiveUrl(up);
      }
    } else if (!now.offline && (await hasDownloads())) {
      // Ningún servidor responde y hay descargas. Confirmamos con un 2.º sondeo
      // antes de caer a offline (un fallo suelto puede ser un hipo). Sin
      // descargas se deja online (la UI ya avisa); caer a una biblioteca vacía
      // sería peor que el aviso.
      consecutiveFails += 1;
      if (consecutiveFails >= 2) {
        consecutiveFails = 0;
        await now.goOffline(true);
        useToast.getState().show(tg('Offline · your downloads'));
      } else {
        schedule(); // re-sondea en un momento para confirmar
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
