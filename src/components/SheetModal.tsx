/**
 * Self-contained bottom sheet: its visibility lives here and is opened
 * imperatively via `openRef`, so showing/hiding it does NOT re-render the
 * screen (with its list) that declares it — with state in the screen, opening
 * the menu had a noticeable delay. The content comes as a function receiving
 * `close` to close after choosing an action.
 */
import { type MutableRefObject, type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export function SheetModal({
  openRef,
  children,
}: {
  /** The screen holds a ref and calls `openRef.current()` to open. */
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
