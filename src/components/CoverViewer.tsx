/**
 * Visor de carátula a pantalla completa (estilo Spotify de escritorio): al
 * tocar la carátula se abre ampliada y centrada sobre un fondo oscuro. Se
 * cierra tocando en cualquier sitio o con el botón atrás.
 */
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { radius, spacing } from '@/theme';

export function CoverViewer({
  uri,
  visible,
  onClose,
}: {
  uri?: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  // Cuadrada y lo más grande posible sin tocar los bordes.
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
      </Pressable>
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
});
