/**
 * Esqueleto de carga para listas de álbumes: filas con carátula cuadrada y dos
 * líneas de texto, pulsando suave, del mismo tamaño que las filas reales
 * (`AlbumRow`: carátula de 56) para que la transición no salte.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/theme';

export function AlbumRowsSkeleton({ count = 10 }: { count?: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.45, { duration: 700 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={[styles.list, pulseStyle]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.cover} />
          <View style={styles.info}>
            <View style={[styles.bar, { width: '55%' }]} />
            <View style={[styles.bar, styles.barThin, { width: '30%' }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const block = { backgroundColor: colors.surfaceHighlight } as const;

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // radius.md, que es el que `Cover` da a las carátulas cuadradas.
  cover: { ...block, width: 56, height: 56, borderRadius: radius.md },
  info: { flex: 1, gap: spacing.sm },
  bar: { ...block, height: 12, borderRadius: radius.sm },
  barThin: { height: 8 },
});
