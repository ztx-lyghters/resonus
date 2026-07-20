/** Fila de una canción dentro de una lista (álbum, playlist, resultados). */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { coverArtUrl, star, unstar } from '@/api/data';
import { type Song } from '@/api/subsonic';
import { useFavoriteIds } from '@/hooks/useFavoriteIds';
import { formatDuration } from '@/lib/format';
import { useDownloads } from '@/store/downloads';
import { usePlayerStore } from '@/store/player';
import { useSongMenu, type SongMenuContext } from '@/store/songMenu';
import { useSettings, type SwipeAction } from '@/store/settings';
import { haptic } from '@/lib/haptics';
import { useToast } from '@/store/toast';
import { useT } from '@/i18n';
import { colors, fontSize, spacing } from '@/theme';
import { Cover } from './Cover';
import { FavoriteButton } from './FavoriteButton';

interface Props {
  song: Song;
  /**
   * Número opcional a la izquierda (p. ej. la pista en un álbum). Convive con
   * la carátula: número y luego portada (estilo "Populares" de Spotify).
   */
  position?: number;
  isCurrent?: boolean;
  /** Contexto de playlist (para permitir "quitar de la lista" en el menú). */
  menuContext?: SongMenuContext;
  /**
   * Permite mostrar el corazón en las canciones favoritas (por defecto sí).
   * Solo aparece si la canción está marcada como favorita (estilo Spotify).
   * En offline se pasa `false` (no hay favoritos de servidor).
   */
  showFavorite?: boolean;
  /** Muestra el botón de menú ⋯ (por defecto sí; funciona también offline). */
  showMenu?: boolean;
  /** Muestra la mini carátula del álbum a la izquierda (estilo Spotify). */
  showArtwork?: boolean;
  /** Modo selección múltiple: círculo de marcado y sin swipe/menú/corazón. */
  selecting?: boolean;
  /** Marcada dentro del modo selección. */
  selected?: boolean;
  onLongPress?: () => void;
  onPress: () => void;
  /** Inicio de la pulsación (antes de onPress/onLongPress); lo usa la lista
   *  para descartar el onPress que sigue al long-press de entrar en selección. */
  onPressIn?: () => void;
}

/** Icono de la franja de swipe según la acción configurada. */
const SWIPE_ICON: Record<Exclude<SwipeAction, 'off'>, keyof typeof Ionicons.glyphMap> = {
  queue: 'list',
  next: 'play-forward',
  favorite: 'heart',
  menu: 'ellipsis-horizontal',
};

/**
 * Franja de acción que asoma tras la fila durante el swipe. Invisible en
 * reposo: la fila es transparente (deja pasar el degradado de la cabecera,
 * estilo Spotify), así que la franja solo puede existir mientras dura el gesto.
 */
function SwipeActionPanel({
  progress,
  icon,
  side,
}: {
  progress: SharedValue<number>;
  icon: keyof typeof Ionicons.glyphMap;
  /** Lado donde asoma la franja: el icono se pega al borde por el que entra. */
  side: 'left' | 'right';
}) {
  const visible = useAnimatedStyle(() => ({ opacity: progress.value > 0.01 ? 1 : 0 }));
  return (
    <Reanimated.View
      style={[
        styles.queueAction,
        { backgroundColor: colors.accent, alignItems: side === 'left' ? 'flex-start' : 'flex-end' },
        visible,
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </Reanimated.View>
  );
}

export function TrackRow({
  song,
  position,
  isCurrent,
  menuContext,
  showFavorite = true,
  showMenu = true,
  showArtwork = false,
  selecting = false,
  selected = false,
  onLongPress,
  onPress,
  onPressIn,
}: Props) {
  const openMenu = useSongMenu((s) => s.open);
  const t = useT();
  const showDuration = useSettings((s) => s.showSongDuration);
  const showRating = useSettings((s) => s.showListRating);
  const swipeAction = useSettings((s) => s.swipeAction);
  const swipeLeftAction = useSettings((s) => s.swipeLeftAction);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNext = usePlayerStore((s) => s.playNext);
  const queryClient = useQueryClient();
  const toast = useToast((s) => s.show);
  const swipeRef = useRef<SwipeableMethods>(null);

  // Favorito: la lista central de favoritos (`favIds`) es la fuente fiable —
  // refleja marcar/desmarcar al invalidarse. El `starred` de la canción (que
  // getAlbum trae pero NO refresca) solo se usa como respaldo mientras esa
  // lista aún carga; si no, al desmarcar en un álbum el corazón se quedaba
  // pegado (el OR con `song.starred` nunca dejaba de ser true).
  const favIds = useFavoriteIds(showFavorite);
  const favorited = showFavorite && (favIds ? favIds.has(song.id) : !!song.starred);
  const downloaded = useDownloads((s) => !!s.files[song.id]);
  // No descargada en el espejo offline: se ve pero en gris y no se reproduce.
  const unavailable = !!song.unavailable;

  // Swipe a la derecha = acción configurable (gesto estilo Spotify). La fila
  // vuelve sola a su sitio; la franja de fondo solo asoma durante el gesto.
  // OJO: el gesto solo convive bien con el scroll si la lista contenedora es
  // de react-native-gesture-handler (FlatList/ScrollView de esa librería).
  async function toggleFavoriteSwipe() {
    const next = !favorited;
    try {
      if (next) await star(song.id, 'song');
      else await unstar(song.id, 'song');
      queryClient.invalidateQueries({ queryKey: ['starred'] });
      toast(next ? t('Added to favorites') : t('Removed from favorites'));
    } catch {
      toast(t("Couldn't complete the action"));
    }
  }

  function runSwipeAction(action: SwipeAction) {
    haptic('light');
    swipeRef.current?.close();
    switch (action) {
      case 'queue':
        addToQueue(song);
        toast(t('Added to queue'));
        break;
      case 'next':
        playNext(song);
        toast(t('Playing next'));
        break;
      case 'favorite':
        void toggleFavoriteSwipe();
        break;
      case 'menu':
        openMenu(song, menuContext);
        break;
      default:
        break;
    }
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      // La franja izquierda la abre el swipe a la DERECHA (y viceversa).
      renderLeftActions={(progress) =>
        swipeAction === 'off' ? null : (
          <SwipeActionPanel progress={progress} icon={SWIPE_ICON[swipeAction]} side="left" />
        )
      }
      renderRightActions={(progress) =>
        swipeLeftAction === 'off' ? null : (
          <SwipeActionPanel progress={progress} icon={SWIPE_ICON[swipeLeftAction]} side="right" />
        )
      }
      // Menos sensible a propósito: `dragOffsetFrom…Edge` obliga a un recorrido
      // horizontal claro antes de activarse (así un scroll vertical con algo de
      // lateral ya no lo dispara sin querer), y el `threshold` pide arrastrar
      // bastante para confirmar la acción.
      dragOffsetFromLeftEdge={30}
      dragOffsetFromRightEdge={30}
      leftThreshold={90}
      rightThreshold={90}
      friction={1}
      overshootLeft={false}
      overshootRight={false}
      enabled={!selecting && !unavailable && (swipeAction !== 'off' || swipeLeftAction !== 'off')}
      onSwipeableWillOpen={(direction) => {
        // `direction` es la dirección del GESTO (no el lado del panel):
        // deslizar a la derecha (abre la franja izquierda) llega como RIGHT.
        if (direction === SwipeDirection.RIGHT) runSwipeAction(swipeAction);
        else if (direction === SwipeDirection.LEFT) runSwipeAction(swipeLeftAction);
      }}
    >
    <Pressable
      // Sin feedback visual al pulsar (como Spotify): el "pressed" saltaba con
      // el dedo al scrollear y parecía que se estaban pulsando las filas.
      style={[styles.row, unavailable && styles.dimmed]}
      onPressIn={unavailable ? undefined : onPressIn}
      onPress={unavailable ? () => toast(t('Not available offline')) : onPress}
      onLongPress={unavailable ? undefined : onLongPress}
    >
      {selecting ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={selected ? colors.accent : colors.textMuted}
        />
      ) : null}
      {position !== undefined ? (
        <Text style={[styles.position, styles.leftSlot]}>{position}</Text>
      ) : null}
      {showArtwork ? (
        <View style={styles.artwork}>
          <Cover uri={coverArtUrl(song.coverArt ?? song.albumId, 100)} size={44} />
        </View>
      ) : null}

      <View style={styles.info}>
        <Text
          style={[styles.title, isCurrent && { color: colors.accent }]}
          numberOfLines={1}
        >
          {song.title}
        </Text>
        {downloaded || song.artist ? (
          <View style={styles.subRow}>
            {downloaded ? (
              <Ionicons name="arrow-down-circle" size={13} color={colors.accent} />
            ) : null}
            {song.artist ? (
              <Text style={styles.artist} numberOfLines={1}>
                {song.artist}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {favorited && !selecting && !unavailable ? (
        <FavoriteButton id={song.id} starred size={20} />
      ) : null}
      {showRating && song.userRating ? (
        <View style={styles.rating} accessibilityLabel={t('Rate {n} stars', { n: song.userRating })}>
          {Array.from({ length: song.userRating }).map((_, i) => (
            <Ionicons key={i} name="star" size={12} color={colors.accent} />
          ))}
        </View>
      ) : null}
      {showDuration ? <Text style={styles.duration}>{formatDuration(song.duration)}</Text> : null}
      {showMenu && !selecting && !unavailable ? (
        <Pressable
          hitSlop={8}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel={t('More options')}
          onPress={() => openMenu(song, menuContext)}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
    // Transparente: el degradado de color de la cabecera (álbum/playlist) se
    // cuela bajo las primeras filas, como en Spotify. La acción de swipe ya no
    // necesita quedar tapada: se oculta sola en reposo (ver QueueAction).
  },
  queueAction: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
  },
  position: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  leftSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Separa el icono de tres puntos del borde derecho y amplía el área de toque
  // (estilo Spotify): el padding vertical hace que casi todo el alto de la fila
  // por su lado sea pulsable, así se atina mucho mejor con el dedo.
  menuButton: {
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  artwork: {
    width: 44,
    height: 44,
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  artist: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  duration: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rating: {
    flexDirection: 'row',
    gap: 1,
  },
  // Canción no disponible sin conexión (espejo): atenuada y no pulsable.
  dimmed: {
    opacity: 0.4,
  },
});
