/**
 * Vibración háptica centralizada, respetando el ajuste del usuario.
 * Solo en acciones clave (favorito, long-press, arrastrar, deslizar para
 * encolar); nunca en toques corrientes, que cansan. Fire-and-forget: si el
 * dispositivo no soporta haptics, falla en silencio.
 */
import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/settings';

type HapticKind = 'light' | 'medium' | 'success';

const IMPACT: Record<Exclude<HapticKind, 'success'>, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
};

export function haptic(kind: HapticKind = 'light'): void {
  if (!useSettings.getState().hapticsEnabled) return;
  if (kind === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } else {
    void Haptics.impactAsync(IMPACT[kind]).catch(() => {});
  }
}
