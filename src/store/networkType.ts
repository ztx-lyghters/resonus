/**
 * Current connection type, cached in a store to decide the streaming bitrate
 * synchronously (`sourceFor` can't await an async) and so the UI reacts if the
 * network changes.
 */
import * as Network from 'expo-network';
import { create } from 'zustand';

interface NetworkTypeState {
  /** true if the active connection is cellular. */
  cellular: boolean;
}

export const useNetworkType = create<NetworkTypeState>(() => ({ cellular: false }));

function apply(type: Network.NetworkStateType | undefined) {
  const cellular = type === Network.NetworkStateType.CELLULAR;
  if (useNetworkType.getState().cellular !== cellular) useNetworkType.setState({ cellular });
}

let started = false;

/** Starts the watcher (idempotent; from the root layout). */
export function initNetworkType(): void {
  if (started) return;
  started = true;
  // Initial state: the listener only fires on changes.
  Network.getNetworkStateAsync()
    .then((s) => apply(s.type))
    .catch(() => {}); // when in doubt, default to `cellular: false` (Wi-Fi quality)
  Network.addNetworkStateListener((s) => apply(s.type));
}
