/** Mensaje breve tipo píldora en la parte inferior (estilo Spotify). */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/store/toast';
import { colors, fontSize, radius, spacing } from '@/theme';

export function Toast() {
  const message = useToast((s) => s.message);
  const actionLabel = useToast((s) => s.actionLabel);
  const runAction = useToast((s) => s.runAction);
  const hide = useToast((s) => s.hide);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    // Con acción («Deshacer») damos más margen para reaccionar.
    const id = setTimeout(hide, actionLabel ? 4000 : 2600);
    return () => clearTimeout(id);
  }, [message, actionLabel, hide]);

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[styles.pill, actionLabel ? styles.pillRow : null, { bottom: insets.bottom + 96 }]}
      // Sin acción el toast es solo informativo y no debe robar toques.
      pointerEvents={actionLabel ? 'box-none' : 'none'}
    >
      <Text style={[styles.text, actionLabel ? styles.textLeft : null]} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel ? (
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          onPress={() => {
            runAction?.();
            hide();
          }}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          {/* Acento inline, no en la hoja de estilos: este módulo se importa en
              el arranque, ANTES de hidratar los ajustes, así que el valor de la
              hoja quedaba congelado en el verde por defecto para siempre. */}
          <Text style={[styles.action, { color: colors.accent }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: '#2E2E2E',
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  pillRow: { flexDirection: 'row', gap: spacing.lg },
  text: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  textLeft: { flex: 1 },
  action: { fontSize: fontSize.sm, fontWeight: '700' },
});
