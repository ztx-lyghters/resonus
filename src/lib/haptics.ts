/**
 * Centralized haptic feedback, respecting the user setting.
 * Only for key actions (favorite, long-press, drag, swipe-to-queue);
 * never on regular taps, which get tiring.
 *
 * On Android we DON'T use expo-haptics presets: they vibrate at amplitude
 * 30-50 (out of 255) and on many motors you can't feel them. `Vibration`
 * from RN core vibrates at the device's default amplitude — short pulses
 * so they feel like a tick, not a buzz. expo-haptics remains for iOS
 * (roadmap) and for its VIBRATE permission in the manifest.
 */
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

import { useSettings } from '@/store/settings';

type HapticKind = 'light' | 'medium' | 'success';

/** Duration (ms) or pattern [wait, vibrate, ...] per type, for Android. */
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
      // no vibrator (tablets, TV): silent
    }
    return;
  }
  if (kind === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } else {
    void Haptics.impactAsync(IOS_IMPACT[kind]).catch(() => {});
  }
}
