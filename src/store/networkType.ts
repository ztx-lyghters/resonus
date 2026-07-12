/**
 * Tipo de conexión actual, cacheado en un store para poder decidir el bitrate
 * de streaming de forma síncrona (`sourceFor` no puede esperar a un async) y
 * para que la UI reaccione si cambia la red.
 */
import * as Network from 'expo-network';
import { create } from 'zustand';

interface NetworkTypeState {
  /** true si la conexión activa son datos móviles. */
  cellular: boolean;
}

export const useNetworkType = create<NetworkTypeState>(() => ({ cellular: false }));

function apply(type: Network.NetworkStateType | undefined) {
  const cellular = type === Network.NetworkStateType.CELLULAR;
  if (useNetworkType.getState().cellular !== cellular) useNetworkType.setState({ cellular });
}

let started = false;

/** Arranca el watcher (idempotente; desde el layout raíz). */
export function initNetworkType(): void {
  if (started) return;
  started = true;
  // Estado inicial: el listener solo dispara en los cambios.
  Network.getNetworkStateAsync()
    .then((s) => apply(s.type))
    .catch(() => {}); // ante la duda queda `cellular: false` (calidad Wi-Fi)
  Network.addNetworkStateListener((s) => apply(s.type));
}
