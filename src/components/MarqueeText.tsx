/**
 * Texto de una línea que, si no cabe, se desplaza en bucle (marquee estilo
 * Spotify): pausa, pasada lineal con una segunda copia persiguiendo al texto
 * y vuelta a empezar. Si cabe, queda como un Text normal que abraza su
 * contenido (así el Pressable que lo envuelva solo es pulsable sobre el
 * texto, no en todo el ancho de la fila).
 *
 * La medida fiable del ancho real sale de un ScrollView horizontal invisible:
 * su contenido no está limitado por el ancho del padre. (Un Text suelto
 * dentro de una View mide como mucho el ancho disponible, así que el
 * desbordamiento no se detectaría nunca.)
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Hueco entre el final del texto y la copia que lo persigue. */
const GAP = 48;
/** Velocidad de la pasada (px/s). */
const SPEED = 30;
/** Espera antes de cada pasada. */
const PAUSE_MS = 2500;

export function MarqueeText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  // Ancho del contenedor (con texto corto ≈ el propio texto; con texto largo,
  // el hueco disponible, porque maxWidth lo capa) y ancho real del texto.
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const offset = useSharedValue(0);

  const overflows = containerW > 0 && textW > containerW + 1;

  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    if (!overflows) return;
    const distance = textW + GAP;
    // reduceMotion Never: sin marquee el título largo queda cortado sin
    // forma de leerlo, así que se anima también con "reducir movimiento".
    offset.value = withRepeat(
      withDelay(
        PAUSE_MS,
        withTiming(-distance, {
          duration: (distance / SPEED) * 1000,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.Never,
        }),
        ReduceMotion.Never,
      ),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );
    return () => cancelAnimation(offset);
  }, [overflows, textW, text, offset]);

  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View style={styles.hug} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* Medidor invisible del ancho real, fuera del flujo. */}
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        pointerEvents="none"
        style={styles.measurer}
      >
        {/* key: al cambiar el texto se remonta y onLayout re-mide siempre. */}
        <Text
          key={text}
          numberOfLines={1}
          style={style}
          onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
        >
          {text}
        </Text>
      </ScrollView>

      {overflows ? (
        <View style={[styles.clip, { width: containerW }]}>
          <ScrollView
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            pointerEvents="none"
          >
            <Animated.View style={[styles.row, anim]}>
              <Text numberOfLines={1} style={style}>
                {text}
              </Text>
              <Text numberOfLines={1} style={[style, { paddingLeft: GAP }]}>
                {text}
              </Text>
            </Animated.View>
          </ScrollView>
        </View>
      ) : (
        <Text numberOfLines={1} style={style}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Abraza el contenido sin pasarse del hueco (como el viejo `tapText`).
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  measurer: { position: 'absolute', opacity: 0, height: 0 },
  clip: { overflow: 'hidden' },
  row: { flexDirection: 'row' },
});
