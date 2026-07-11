/**
 * Animación de hoja inferior dentro de un `Modal` (animationType="none"):
 * el fondo se funde y la hoja desliza desde abajo al abrir (240 ms) y baja al
 * cerrar (160 ms). `dismiss(after)` reproduce la salida y luego ejecuta el
 * cierre real (quien cierra el Modal), así la hoja no desaparece de golpe.
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

// Las hojas siempre animan, aunque el sistema tenga "quitar animaciones":
// sin transición aparecen de golpe con un salto de layout visible (además
// Reanimated solo lee ese ajuste al arrancar, así que ni siquiera refleja
// cambios hechos con la app abierta). Igual que el player y las letras.
const TIMING_IN = { duration: 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never };
const TIMING_OUT = { duration: 160, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.Never };

const SCREEN_H = Dimensions.get('window').height;

export function useBottomSheetAnim(open: boolean) {
  const progress = useSharedValue(0);
  // Altura real de la hoja (medida en el primer layout); hasta entonces, una
  // pantalla entera para que el primer frame quede seguro fuera de vista.
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
