/** State for toast messages (brief Spotify-style notifications). */
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Optional action to the right of the message (e.g. «Undo»). */
  actionLabel: string | null;
  runAction: (() => void) | null;
  show: (message: string, action?: { label: string; run: () => void }) => void;
  hide: () => void;
}

// ── Destructive actions with undo ───────────────────────────────────────────
// The actual deletion is deferred: the UI updates optimistically and `commit`
// only runs when the toast expires or another replaces it. «Undo» cancels the
// commit and restores the UI, so there's nothing to undo on the server. Only
// one pending action at a time: the new one consolidates the previous one.
let pendingCommit: (() => void) | null = null;

/** Executes (and clears) the pending commit, if any. */
function commitPendingUndo() {
  const commit = pendingCommit;
  pendingCommit = null;
  commit?.();
}

/** Shows a «message · Undo» toast, deferring the actual deletion. */
export function showUndoToast(
  message: string,
  label: string,
  opts: {
    /** Performs the actual deletion (when the toast expires or another arrives). */
    commit: () => void;
    /** Restores the optimistic UI on undo tap. */
    undo: () => void;
  },
) {
  useToast.getState().show(message, {
    label,
    run: () => {
      pendingCommit = null;
      opts.undo();
    },
  });
  pendingCommit = opts.commit;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  actionLabel: null,
  runAction: null,
  show: (message, action) => {
    commitPendingUndo();
    set({ message, actionLabel: action?.label ?? null, runAction: action?.run ?? null });
  },
  hide: () => {
    // First hide, then consolidate: if the commit shows another toast (e.g. an
    // error), we don't want to overwrite it.
    set({ message: null, actionLabel: null, runAction: null });
    commitPendingUndo();
  },
}));
