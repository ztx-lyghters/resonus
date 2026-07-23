/**
 * Full-screen cover viewer (desktop Spotify style): tapping the cover opens it
 * enlarged and centered on a dark background. Closes by tapping anywhere or
 * with the back button. Supports actions below the image (e.g. "Change cover"
 * on playlists) and child dialogs.
 */
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { radius, spacing } from '@/theme';

export function CoverViewer({
  uri,
  visible,
  onClose,
  footer,
  children,
}: {
  uri?: string;
  visible: boolean;
  onClose: () => void;
  /** Actions below the image; tapping them doesn't close the viewer. */
  footer?: ReactNode;
  /** Extra content inside the Modal (e.g. a password Dialog). */
  children?: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  // Square and as large as possible without touching the edges.
  const size = Math.min(width - spacing.lg * 2, height * 0.72);

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Image
          source={uri ? { uri } : undefined}
          style={{ width: size, height: size, borderRadius: radius.lg }}
          contentFit="contain"
          transition={150}
        />
        {footer ? (
          // Pressable without onPress: absorbs the touch so that tapping
          // between the footer buttons doesn't close the viewer via backdrop.
          <Pressable style={styles.footer}>{footer}</Pressable>
        ) : null}
      </Pressable>
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: spacing.xl * 2,
    alignItems: 'center',
    gap: spacing.lg,
  },
});
