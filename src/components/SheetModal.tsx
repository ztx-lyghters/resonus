/**
 * Hoja inferior autocontenida: su visibilidad vive aquí dentro y se abre
 * imperativamente vía `openRef`, así mostrarla u ocultarla NO re-renderiza la
 * pantalla (con su lista) que la declara — con estado en la pantalla, abrir el
 * menú tenía un delay visible. El contenido llega como función que recibe
 * `close` para cerrar tras elegir una acción.
 */
import { type MutableRefObject, type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export function SheetModal({
  openRef,
  children,
}: {
  /** La pantalla guarda un ref y llama `openRef.current()` para abrir. */
  openRef: MutableRefObject<() => void>;
  children: (close: () => void) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  openRef.current = () => setOpen(true);
  const close = () => setOpen(false);

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        {children(close)}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
