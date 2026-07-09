/** Estado de los mensajes tipo toast (notificaciones breves estilo Spotify). */
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Acción opcional a la derecha del mensaje (p. ej. «Deshacer»). */
  actionLabel: string | null;
  runAction: (() => void) | null;
  show: (message: string, action?: { label: string; run: () => void }) => void;
  hide: () => void;
}

// ── Acciones destructivas con deshacer ──────────────────────────────────────
// El borrado real se difiere: la UI se actualiza de forma optimista y el
// `commit` solo se ejecuta cuando el toast caduca o lo sustituye otro.
// «Deshacer» cancela el commit y restaura la UI, así no hay nada que rehacer
// en el servidor. Solo hay una acción pendiente a la vez: la nueva consolida
// la anterior.
let pendingCommit: (() => void) | null = null;

/** Ejecuta (y limpia) el commit pendiente, si lo hay. */
function commitPendingUndo() {
  const commit = pendingCommit;
  pendingCommit = null;
  commit?.();
}

/** Muestra un toast «mensaje · Deshacer» difiriendo el borrado real. */
export function showUndoToast(
  message: string,
  label: string,
  opts: {
    /** Ejecuta el borrado de verdad (al caducar el toast o llegar otro). */
    commit: () => void;
    /** Restaura la UI optimista al pulsar deshacer. */
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
    // Primero se oculta y luego se consolida: si el commit muestra otro toast
    // (p. ej. un error), no queremos pisarlo.
    set({ message: null, actionLabel: null, runAction: null });
    commitPendingUndo();
  },
}));
