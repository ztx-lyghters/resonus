/**
 * Vibración háptica centralizada, respetando el ajuste del usuario.
 * Solo en acciones clave (favorito, long-press, arrastrar, deslizar para
 * encolar); nunca en toques corrientes, que cansan.
 *
 * En Android NO usamos los presets de expo-haptics: vibran a amplitud 30-50
 * (de 255) y en muchos motores no se sienten. `Vibration` de RN core vibra a
 * la amplitud por defecto del dispositivo — pulsos cortos para que sean un
 * tick, no un zumbido. expo-haptics queda para iOS (roadmap) y por su permiso
 * VIBRATE en el manifest.
 */
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

import { useSettings } from '@/store/settings';

type HapticKind = 'light' | 'medium' | 'success';

/** Duración (ms) o patrón [espera, vibra, …] por tipo, para Android. */
const ANDROID_PATTERN: Record<HapticKind, number | number[]> = {
  light: 15,
  medium: 30,
  success: [0, 30, 80, 40],
};

const IOS_IMPACT: Record<Exclude<HapticKind, 'success'>, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
};

export function haptic(kind: HapticKind = 'light'): void {
  if (!useSettings.getState().hapticsEnabled) return;
  if (Platform.OS === 'android') {
    try {
      Vibration.vibrate(ANDROID_PATTERN[kind]);
    } catch {
      // sin vibrador (tablets, TV): silencio
    }
    return;
  }
  if (kind === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } else {
    void Haptics.impactAsync(IOS_IMPACT[kind]).catch(() => {});
  }
}
