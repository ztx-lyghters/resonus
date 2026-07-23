/**
 * Bottom sheet animation inside a `Modal` (animationType="none"):
 * the backdrop fades and the sheet slides up from the bottom on open (240 ms)
 * and slides down on close (160 ms). `dismiss(after)` plays the exit animation
 * and then runs the actual close (whoever closes the Modal), so the sheet
 * doesn't vanish abruptly.
 */
import { useEffect } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';
import {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Sheets always animate, even when the system has "remove animations" enabled:
// without a transition they appear abruptly with a visible layout jump (and
// Reanimated only reads that setting at startup, so it doesn't even reflect
// changes made while the app is open). Same as the player and lyrics.
const TIMING_IN = { duration: 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never };
const TIMING_OUT = { duration: 160, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.Never };

const SCREEN_H = Dimensions.get('window').height;

export function useBottomSheetAnim(open: boolean) {
  const progress = useSharedValue(0);
  // Actual sheet height (measured on first layout); until then, a full screen
  // height so the first frame stays safely out of view.
  const sheetH = useSharedValue(SCREEN_H);

  useEffect(() => {
    if (open) {
      progress.value = withTiming(1, TIMING_IN);
    } else {
      progress.value = 0;
    }
  }, [open, progress]);

  const dismiss = (after: () => void) => {
    progress.value = withTiming(0, TIMING_OUT, (f) => {
      if (f) runOnJS(after)();
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetH.value }],
  }));
  const onSheetLayout = (e: LayoutChangeEvent) => {
    sheetH.value = e.nativeEvent.layout.height;
  };

  return { dismiss, backdropStyle, sheetStyle, onSheetLayout };
}
