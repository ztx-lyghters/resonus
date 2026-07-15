/**
 * Letra estilo Spotify/Apple Music para el player: tarjeta bajo los controles
 * con el color dominante de la carátula. Dentro, karaoke con auto-scroll si la
 * letra viene sincronizada (tocar una línea salta a ese punto) y foco animado
 * en la línea que suena (las demás se atenúan). Botón para expandir a la
 * pantalla completa (/lyrics). Si la canción no tiene letra, no se pinta nada.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { coverArtUrl } from '@/api/data';
import { type LyricLine } from '@/api/subsonic';
import { useDominantColor } from '@/hooks/useDominantColor';
import { useLyrics } from '@/hooks/useLyrics';
import { useT } from '@/i18n';
import { currentSong, usePlayerStore } from '@/store/player';
import { useSettings } from '@/store/settings';
import { colors, fontSize, radius, spacing } from '@/theme';

export function LyricsCard() {
  const t = useT();
  const router = useRouter();
  const song = usePlayerStore(currentSong);
  const { data } = useLyrics(song ?? undefined);
  // Mismo ajuste que la pantalla completa; sin color, gris neutro (surface)
  // para que la tarjeta se siga distinguiendo del fondo del player.
  const colorBackground = useSettings((s) => s.lyricsColorBackground);
  const dominant = useDominantColor(
    // Sin color no se extrae la paleta (mismo ahorro que hace el player).
    colorBackground ? coverArtUrl(song?.coverArt ?? song?.albumId, 600) : undefined,
  );
  const bg = colorBackground ? dominant : colors.surface;

  if (!data) return null;

  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <Text style={styles.title}>{t('Lyrics')}</Text>
      <View style={styles.body}>
        {data.synced ? (
          <SyncedLyricsView lines={data.lines} nested fadeColor={bg} />
        ) : (
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <Text style={lyricsStyles.line}>{data.lines.map((l) => l.value).join('\n')}</Text>
          </ScrollView>
        )}
      </View>
      <Pressable
        style={({ pressed }) => [styles.expand, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('Lyrics')}
        hitSlop={8}
        onPress={() => router.push('/lyrics')}
      >
        <MaterialIcons name="open-in-full" size={16} color="#000" />
      </Pressable>
    </View>
  );
}

/**
 * Letra en el sitio de la carátula (ajuste «Lyrics on the cover»): ocupa el
 * mismo cuadro que la carátula del reproductor. Mismo karaoke que la tarjeta,
 * con un botón en la esquina para volver a la carátula. Si no hay letra, no se
 * pinta (el que llama solo la monta cuando la hay).
 */
export function CoverLyrics({ size, onClose }: { size: number; onClose: () => void }) {
  const t = useT();
  const song = usePlayerStore(currentSong);
  const { data } = useLyrics(song ?? undefined);

  if (!data) return null;

  return (
    // Fondo transparente: la letra va directa sobre el fondo del reproductor
    // (la carátula se oculta mientras se muestra).
    <View style={[styles.coverBox, { width: size, height: size }]}>
      <View style={styles.coverBody}>
        {data.synced ? (
          <SyncedLyricsView lines={data.lines} nested />
        ) : (
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <Text style={lyricsStyles.line}>{data.lines.map((l) => l.value).join('\n')}</Text>
          </ScrollView>
        )}
      </View>
      <Pressable
        style={({ pressed }) => [styles.expand, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('Show cover')}
        hitSlop={8}
        onPress={onClose}
      >
        <MaterialIcons name="image" size={16} color="#000" />
      </Pressable>
    </View>
  );
}

/**
 * Lista karaoke reutilizable (tarjeta y pantalla completa): la línea que suena
 * se ilumina y crece un poco (resorte), el resto se atenúa. Auto-scroll que
 * mantiene el foco arriba; el scroll manual lo pausa unos segundos. Tocar una
 * línea salta a ese punto de la canción.
 */
export function SyncedLyricsView({
  lines,
  large,
  nested,
  fadeColor,
}: {
  lines: LyricLine[];
  /** Tipografía grande (pantalla completa). */
  large?: boolean;
  /** Dentro de otro scroll (la tarjeta del player). */
  nested?: boolean;
  /** Color al que se funden los bordes superior/inferior (el fondo). */
  fadeColor?: string;
}) {
  const positionSec = usePlayerStore((s) => s.positionSec);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Posición real del scroll (la mueva quien la mueva: usuario o auto-scroll).
  const liveY = useScrollViewOffset(scrollRef);
  // Objetivo del auto-scroll. Se anima con Reanimated (no con el smooth-scroll
  // nativo) por dos razones: el nativo respeta la escala de animaciones del
  // sistema (con "animaciones reducidas" pega un tirón seco) y mientras corre
  // el ScrollView se traga los taps sobre las líneas.
  const targetY = useSharedValue(0);
  const offsets = useRef<{ y: number; h: number }[]>([]);
  const userScroll = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El primer posicionamiento salta directo a la línea que suena (sin animar),
  // para no hacer un scroll rápido y feo desde arriba al abrir. A partir de ahí
  // el avance de una línea a la siguiente sí se anima.
  const didInitialScroll = useRef(false);
  const [viewH, setViewH] = useState(0);

  // Pequeño adelanto para que el resalte no llegue tarde al oído.
  const posMs = positionSec * 1000 + 300;
  let current = -1;
  for (let i = 0; i < lines.length && (lines[i].start ?? 0) <= posMs; i++) current = i;

  // A pantalla completa anclamos la línea activa cerca del centro (y rellenamos
  // arriba/abajo) para que al empezar la canción la letra arranque centrada y
  // legible, no pegada al borde superior. En la tarjeta pequeña, más arriba.
  const anchor = large ? 0.42 : 0.3;

  const onMeasure = useCallback((index: number, y: number, h: number) => {
    offsets.current[index] = { y, h };
  }, []);

  // Cada cambio de targetY empuja el scroll desde el hilo de UI.
  useAnimatedReaction(
    () => targetY.value,
    (y, prev) => {
      if (prev !== null && y !== prev) scrollTo(scrollRef, 0, y, false);
    },
  );

  // Tocar una línea es un salto deliberado: se cancela la pausa del auto-scroll
  // por scroll manual (el usuario suele haber hecho scroll para llegar a la
  // línea) y así el foco recentra la línea elegida al instante.
  const onLineTap = useCallback(
    (sec: number) => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      userScroll.current = false;
      seekTo(sec);
    },
    [seekTo],
  );

  // Los taps se detectan con un gesto aparte (no con onPress de cada línea):
  // el gesto convive con el scroll y funciona aunque el auto-scroll esté en
  // marcha. La línea se localiza por posición vertical con las medidas reales.
  const handleTap = useCallback(
    (yInView: number) => {
      const contentY = yInView + liveY.value;
      for (let i = 0; i < lines.length; i++) {
        const m = offsets.current[i];
        if (m && contentY >= m.y && contentY < m.y + m.h) {
          if (lines[i].start !== undefined) onLineTap(lines[i].start! / 1000);
          return;
        }
      }
    },
    [lines, onLineTap, liveY],
  );

  const tapGesture = Gesture.Tap()
    .maxDuration(300)
    .onEnd((e) => {
      runOnJS(handleTap)(e.y);
    });

  useEffect(() => {
    if (current < 0 || viewH === 0 || userScroll.current) return;
    const m = offsets.current[current];
    if (m === undefined) return;
    const dest = Math.max(0, m.y - viewH * anchor);
    cancelAnimation(targetY);
    if (!didInitialScroll.current) {
      targetY.value = dest; // salto directo, sin animar
      didInitialScroll.current = true;
      return;
    }
    // Partimos de la posición real (el usuario puede haber hecho scroll) y
    // animamos nosotros: mismo recorrido en cualquier móvil, ignore o no el
    // sistema las animaciones.
    targetY.value = liveY.value;
    targetY.value = withTiming(dest, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
  }, [current, viewH, anchor, targetY, liveY]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  const fadeH = large ? 56 : 36;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={tapGesture}>
      <Animated.ScrollView
        ref={scrollRef}
        nestedScrollEnabled={nested}
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
        onScrollBeginDrag={() => {
          userScroll.current = true;
          cancelAnimation(targetY);
          if (resumeTimer.current) clearTimeout(resumeTimer.current);
        }}
        onScrollEndDrag={() => {
          resumeTimer.current = setTimeout(() => {
            userScroll.current = false;
          }, 3000);
        }}
        contentContainerStyle={[
          styles.content,
          // Relleno para que la primera/última línea puedan quedar en el ancla
          // (centro) en vez de tope arriba/abajo. Solo a pantalla completa.
          large && viewH > 0 ? { paddingTop: viewH * anchor, paddingBottom: viewH * (1 - anchor) } : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {lines.map((line, i) => (
          <LyricRow
            key={i}
            index={i}
            text={line.value.trim() || '♪'}
            active={i === current}
            next={i === current + 1}
            large={large}
            onMeasure={onMeasure}
          />
        ))}
      </Animated.ScrollView>
      </GestureDetector>
      {fadeColor ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={[fadeColor, `${fadeColor}00`]}
            style={[styles.fade, { top: 0, height: fadeH }]}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[`${fadeColor}00`, fadeColor]}
            style={[styles.fade, { bottom: 0, height: fadeH }]}
          />
        </>
      ) : null}
    </View>
  );
}

/** Una línea de letra con foco animado (resorte al activarse). */
const LyricRow = memo(({
  index,
  text,
  active,
  next,
  large,
  onMeasure,
}: {
  index: number;
  text: string;
  active: boolean;
  next: boolean;
  large?: boolean;
  onMeasure: (index: number, y: number, h: number) => void;
}) => {
  // Solo la línea activa crece (resorte) y se ve al 100 %. El resto se atenúa:
  // la siguiente que va a sonar un poco, las demás bastante más.
  const focus = useSharedValue(active ? 1 : 0);
  const dim = useSharedValue(active ? 1 : next ? 0.55 : 0.3);
  // reduceMotion Never: la transición entre líneas (karaoke) es la esencia de
  // la pantalla; sin esto, los móviles con "reducir movimiento" la saltan.
  useEffect(() => {
    focus.value = withSpring(active ? 1 : 0, {
      damping: 20,
      stiffness: 180,
      mass: 0.5,
      reduceMotion: ReduceMotion.Never,
    });
  }, [active, focus]);
  useEffect(() => {
    dim.value = withTiming(active ? 1 : next ? 0.55 : 0.3, {
      duration: 300,
      reduceMotion: ReduceMotion.Never,
    });
  }, [active, next, dim]);
  // El crecimiento (8 %) se compensa con el hueco derecho de `content` para que
  // la línea activa, al escalar desde la izquierda, no se salga por el borde.
  const anim = useAnimatedStyle(() => ({
    opacity: dim.value,
    transform: [{ scale: 1 + focus.value * 0.08 }],
  }));
  return (
    <View
      onLayout={(e) => onMeasure(index, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      <Animated.Text style={[lyricsStyles.line, large && lyricsStyles.lineLarge, styles.leftOrigin, anim]}>
        {text}
      </Animated.Text>
    </View>
  );
});
LyricRow.displayName = 'LyricRow';

/** Tipografía compartida por la tarjeta y la pantalla completa. */
export const lyricsStyles = StyleSheet.create({
  line: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '700',
    paddingVertical: spacing.xs,
  },
  lineLarge: { fontSize: 28, lineHeight: 40, paddingVertical: spacing.sm },
});

const CARD_BODY_H = 280;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    // El player ya no tiene padding lateral global (por el slider): el margen
    // de la tarjeta lo pone ella misma.
    marginHorizontal: spacing.xl,
    padding: spacing.lg,
  },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  body: { height: CARD_BODY_H, overflow: 'hidden' },
  // Letra en el sitio de la carátula: cuadro del tamaño exacto de la carátula.
  coverBox: { borderRadius: radius.md, overflow: 'hidden', padding: spacing.lg },
  coverBody: { flex: 1, overflow: 'hidden' },
  wrap: { flex: 1 },
  // Hueco a la derecha para que la línea activa (que crece un 8 % desde la
  // izquierda) no se recorte contra el borde.
  content: { paddingBottom: spacing.xl, paddingRight: '10%' },
  leftOrigin: { transformOrigin: 'left center' },
  fade: { position: 'absolute', left: 0, right: 0 },
  expand: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
