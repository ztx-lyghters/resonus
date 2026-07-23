/**
 * Spotify-style playback queue, in sections:
 *   · Now playing — the current song (fixed, can't be dragged or removed).
 *   · Next up — manually added items (`queuedCount` block).
 *   · Next from: {source} — the rest of what was playing.
 * Only current and upcoming are shown (already-played doesn't appear).
 * Drag to reorder, remove and clear. Section headers are derived from the
 * position, so they reposition themselves on reorder.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReorderableList, {
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';

import { coverArtUrl } from '@/api/data';
import { type Song } from '@/api/subsonic';
import { Cover } from '@/components/Cover';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { SheetModal } from '@/components/SheetModal';
import { formatTotalDuration } from '@/lib/format';
import { SOURCE_FAVORITES, SOURCE_HISTORY, usePlayerStore } from '@/store/player';
import { usePlaylistPicker } from '@/store/playlistPicker';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { colors, fontSize, spacing } from '@/theme';
import { listPerf } from '@/lib/listPerf';

// ReorderableList doesn't support removeClippedSubviews (needs cells mounted
// to animate the drag); we use the rest of the performance props.
const queueListPerf = {
  initialNumToRender: listPerf.initialNumToRender,
  maxToRenderPerBatch: listPerf.maxToRenderPerBatch,
  windowSize: listPerf.windowSize,
};

function SectionHeader({ title, gap }: { title: string; gap?: boolean }) {
  return <Text style={[styles.sectionHeader, gap && styles.sectionGap]}>{title}</Text>;
}

/** Current song: fixed at the top, highlighted, no controls. */
function NowPlayingRow({ song }: { song: Song }) {
  const showListArtwork = useSettings((s) => s.showListArtwork);
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        {showListArtwork ? (
          <View style={styles.artwork}>
            <Cover uri={coverArtUrl(song.coverArt ?? song.albumId, 100)} size={44} />
          </View>
        ) : null}
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.accent }]} numberOfLines={1}>
            {song.title}
          </Text>
          {song.artist ? (
            <Text style={styles.artist} numberOfLines={1}>
              {song.artist}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="volume-medium" size={20} color={colors.accent} />
    </View>
  );
}

/** Fila ya reproducida (ajuste opcional): atenuada, tocar → vuelve a esa pista. */
function PlayedRow({ item, absIndex }: { item: Song; absIndex: number }) {
  const jumpTo = usePlayerStore((s) => s.jumpTo);
  const showListArtwork = useSettings((s) => s.showListArtwork);
  return (
    <Pressable style={[styles.row, styles.played]} onPress={() => jumpTo(absIndex)}>
      <View style={styles.main}>
        {showListArtwork ? (
          <View style={styles.artwork}>
            <Cover uri={coverArtUrl(item.coverArt ?? item.albumId, 100)} size={44} />
          </View>
        ) : null}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.artist ? (
            <Text style={styles.artist} numberOfLines={1}>
              {item.artist}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Row for upcoming tracks: can be tapped (skip), dragged and removed. */
function UpcomingRow({ item, absIndex }: { item: Song; absIndex: number }) {
  const jumpTo = usePlayerStore((s) => s.jumpTo);
  const removeAt = usePlayerStore((s) => s.removeAt);
  const showListArtwork = useSettings((s) => s.showListArtwork);
  const toast = useToast((s) => s.show);
  const t = useT();
  const drag = useReorderableDrag();

  const remove = async () => {
    const undo = await removeAt(absIndex);
    if (undo) toast(t('Removed from queue'), { label: t('Undo'), run: undo });
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={() => jumpTo(absIndex)} onLongPress={() => { haptic('medium'); drag(); }}>
        {showListArtwork ? (
          <View style={styles.artwork}>
            <Cover uri={coverArtUrl(item.coverArt ?? item.albumId, 100)} size={44} />
          </View>
        ) : null}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.artist ? (
            <Text style={styles.artist} numberOfLines={1}>
              {item.artist}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable hitSlop={6} onPress={() => void remove()}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Pressable hitSlop={6} onPressIn={() => { haptic('medium'); drag(); }}>
          <Ionicons name="reorder-two" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function QueueScreen() {
  useSettings((s) => s.accentColor); // re-render when accent changes
  useSettings((s) => s.appFont); // re-render when font changes
  const t = useT();
  const router = useRouter();
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const queuedCount = usePlayerStore((s) => s.queuedCount);
  const source = usePlayerStore((s) => s.source);
  const moveTrack = usePlayerStore((s) => s.moveTrack);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const radioMode = usePlayerStore((s) => s.radioMode);
  const stopRadio = usePlayerStore((s) => s.stopRadio);
  // The store's accent, not `colors.accent`: without subscription the icon
  // would keep the previous one while the screen stays mounted.
  const accent = useSettings((s) => s.accentColor);
  const toast = useToast((s) => s.show);
  const [confirmClear, setConfirmClear] = useState(false);
  // ⋯ menu (imperative: opening/closing doesn't re-render the screen).
  const menuRef = useRef<() => void>(() => {});

  const showPlayed = useSettings((s) => s.showPlayedInQueue);
  const current = queue[index] ?? null;
  const upcoming = queue.slice(index + 1);
  // Already played (setting): its absolute index is its own position 0..index-1.
  const played = showPlayed ? queue.slice(0, index) : [];
  const totalSec = upcoming.reduce((acc, s) => acc + (s.duration ?? 0), 0);

  // Source label for the "Next from:" section; favorites/history sentinels
  // are translated (like in the player).
  const sourceName =
    source === SOURCE_FAVORITES
      ? t('Favorites')
      : source === SOURCE_HISTORY
        ? t('History')
        : source;
  const contextHeader = sourceName ? t('Next from {name}', { name: sourceName }) : null;

  /** Section header for upcoming row `rel` (or null). */
  const headerFor = (rel: number): string | null => {
    if (queuedCount > 0 && rel === 0) return t('Next in queue');
    if (rel === queuedCount && contextHeader) return contextHeader;
    return null;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter} pointerEvents="none">
          <Text style={styles.headerTitle}>{t('Queue')}</Text>
          {upcoming.length > 0 && totalSec > 0 ? (
            <Text style={styles.headerSub}>
              {t('{n} songs', { n: upcoming.length })} · {formatTotalDuration(totalSec)}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {/* That this icon EXISTS is the warning that radio is still extending the
              queue; tapping it stops it. No icon without radio, so it's not in the
              way. It's a button, not a toggle: one that disappears on turning off
              couldn't be turned back on. To resume, you start another mix. */}
          {radioMode ? (
            <Pressable
              style={styles.headerAction}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Stop the mix')}
              onPress={() => {
                stopRadio();
                toast(t('The mix won’t grow any further'));
              }}
            >
              <Ionicons name="sparkles" size={22} color={accent} />
            </Pressable>
          ) : null}
          {upcoming.length > 0 ? (
            <Pressable
              style={styles.headerAction}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Clear queue')}
              onPress={() => setConfirmClear(true)}
            >
              <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          {queue.length > 0 ? (
            <Pressable
              style={styles.headerAction}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('More options')}
              onPress={() => menuRef.current()}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {current ? (
        <ReorderableList
          {...queueListPerf}
          data={upcoming}
          keyExtractor={(item, i) => `${item.id}-${i}`}
          ListHeaderComponent={
            <View>
              {played.length > 0 ? (
                <View>
                  <SectionHeader title={t('Played')} />
                  {played.map((s, i) => (
                    <PlayedRow key={`${s.id}-${i}`} item={s} absIndex={i} />
                  ))}
                </View>
              ) : null}
              <SectionHeader title={t('Now playing')} gap={played.length > 0} />
              <NowPlayingRow song={current} />
            </View>
          }
          renderItem={({ item, index: rel }) => {
            const header = headerFor(rel);
            return (
              <View style={styles.cell}>
                {header ? <SectionHeader title={header} gap /> : null}
                <UpcomingRow item={item} absIndex={index + 1 + rel} />
              </View>
            );
          }}
          onReorder={({ from, to }: ReorderableListReorderEvent) => {
            moveTrack(index + 1 + from, index + 1 + to);
          }}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="list-outline"
            title={t('The queue is empty.')}
            subtitle={t('Play a song or album to start the queue.')}
          />
        </View>
      )}

      <Dialog
        visible={confirmClear}
        title={t('Clear queue')}
        message={t('The current song keeps playing.')}
        confirmLabel={t('Clear all')}
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          const undo = clearQueue();
          if (undo) toast(t('Queue cleared'), { label: t('Undo'), run: undo });
        }}
      />

      <SheetModal openRef={menuRef}>
        {(close) => (
          <Pressable
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
            onPress={() => {
              close();
              const q = usePlayerStore.getState().queue;
              if (q.length > 0) usePlaylistPicker.getState().open(q);
            }}
          >
            <Ionicons name="add" size={24} color={colors.text} />
            <Text style={styles.actionText}>{t('Add to a playlist')}</Text>
          </Pressable>
        )}
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // ⋯ menu row (same look as the playlist / media menu).
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.md },
  actionText: { color: colors.text, fontSize: fontSize.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // Absolute and centered over the bar: as a flex child it would shift off
  // center when right-side icons appear/disappear (`space-between` distributes
  // among all children). Uses pointerEvents="none" to not eat their touches.
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAction: { width: 28, alignItems: 'center' },
  headerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  sectionHeader: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sectionGap: { marginTop: spacing.lg },
  cell: { backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    // Opaque background so the dragged row covers the others while passing.
    backgroundColor: colors.background,
  },
  // Already-played rows: dimmed to read as "past" without disappearing.
  played: { opacity: 0.55 },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  artwork: { width: 44, height: 44 },
  info: { flex: 1 },
  title: { color: colors.text, fontSize: fontSize.md },
  artist: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
