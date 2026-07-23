/** Browse all artists on the server, with quick filter. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  FlatList as GHFlatList,
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAlbumList, getArtists, type Album, type Artist } from '@/api/data';
import { ArtistCard } from '@/components/ArtistCard';
import { ArtistGridSkeleton } from '@/components/ArtistGridSkeleton';
import { ArtistListSkeleton } from '@/components/ArtistListSkeleton';
import { ArtistRow } from '@/components/ArtistRow';
import { useHistoryTimes } from '@/hooks/useHistoryTimes';
import { EmptyState } from '@/components/EmptyState';
import { Message } from '@/components/Message';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/auth';
import { useLastPlayed } from '@/store/lastPlayed';
import { useSettings } from '@/store/settings';
import { colors, fontSize, radius, spacing, SCREEN_BOTTOM_PADDING } from '@/theme';
import { listPerf } from '@/lib/listPerf';

// Three columns, like the Library grid: circles come out to ~121dp, nearly
// the 130dp Home uses for artists. Two columns (the album grid) would go to
// 186dp and only fit four per screen, which with 500 artists is endless
// scrolling. An album is recognized by its cover and deserves size; an artist
// is recognized by their face much sooner.
const COLUMNS = 3;
const GAP = spacing.sm;
const CARD = (Dimensions.get('window').width - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

/**
 * Client-side sorting: `getArtists()` brings the full index at once and
 * alphabetical, and Subsonic offers no other order for artists (unlike
 * albums, where the server sorts). Since they're all here already, sorting
 * is free.
 */
type ArtistSort = 'alpha' | 'recent' | 'newest' | 'frequent' | 'random';

// Same order as the Album chips (without 'Artist', which doesn't make sense
// here): they're sibling screens and seeing them ordered differently felt jarring.
const SORTS: { key: ArtistSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'newest', label: 'Recently added' },
  { key: 'alpha', label: 'A-Z' },
  { key: 'frequent', label: 'Most played' },
  { key: 'random', label: 'Shuffle' },
];

/** How many albums are checked to infer frequent / recently added artists. */
const FREQUENT_POOL = 50;

/** Height of the expanded bar: the box (44) plus its gap to the chips. */
const SEARCH_H = 44 + spacing.md;

export default function BrowseArtistsScreen() {
  const router = useRouter();
  const t = useT();
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ArtistSort>('recent');
  const layout = useSettings((s) => s.browseArtistsLayout);
  const setLayout = useSettings((s) => s.setBrowseArtistsLayout);
  const grid = layout === 'grid';

  // "Recent" blends both sources: having opened their screen and having
  // played within any queue. Neither alone tells the full story.
  const times = useLastPlayed((s) => s.times);
  const { byArtist } = useHistoryTimes();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['allArtists'],
    queryFn: () => getArtists(),
    enabled: canFetch,
  });

  // ── Pull-down search ───────────────────────────────────────────────────
  // Same gesture as the song lists (TrackListView): the bar is painted
  // collapsed (height 0) above the chips and pulling the grid while at the
  // top reveals it. Here it's a sibling of the list, not its header: the
  // chips are in the middle and must stay fixed, so the bar can't live inside
  // the scroll. Growing pushes chips and grid equally, which is the desired
  // effect.
  const listRef = useRef<GHFlatList<Artist>>(null);
  const [searching, setSearching] = useState(false);
  const [revealed, setRevealed] = useState(false);
  /** Last real scroll offset (the gesture only reveals when at the top). */
  const lastOffsetY = useRef(0);
  const searchH = useRef(new Animated.Value(0)).current;

  function revealSearchBar() {
    haptic('light');
    setRevealed(true);
    Animated.timing(searchH, { toValue: SEARCH_H, duration: 200, useNativeDriver: false }).start();
  }

  function collapseSearchBar() {
    setRevealed(false);
    Animated.timing(searchH, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }

  function cancelSearch() {
    Keyboard.dismiss();
    setQuery('');
    setSearching(false);
    collapseSearchBar();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  // Simultaneous pan with the scroll: doesn't steal the gesture, only observes.
  // Android doesn't emit overscroll events (the list locks offset at 0), so
  // "pull down while at the top" must be detected separately.
  const revealPanRef = useRef<GestureType | undefined>(undefined);
  const revealPan = Gesture.Pan()
    .withRef(revealPanRef)
    .runOnJS(true)
    // Only downward swipes: upward swipes (normal scroll) cancel it.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onChange((e) => {
      // No artists means nothing to filter; with focus set or already deployed
      // there's nothing to reveal.
      if (searching || revealed || (data?.length ?? 0) === 0) return;
      if (lastOffsetY.current <= 1 && e.translationY > 60) revealSearchBar();
    });

  /**
   * "Most played" is deduced from your most played albums: Subsonic doesn't
   * order artists by play count, and local counters go by song id without
   * metadata, so they can't be grouped by artist. It's the same workaround
   * that `getMostPlayedSongs` already does for songs. Only fetched when
   * choosing this order.
   */
  const { data: frequentAlbums } = useQuery({
    queryKey: ['albumList', 'frequent', FREQUENT_POOL],
    queryFn: () => getAlbumList('frequent', FREQUENT_POOL),
    enabled: canFetch && sort === 'frequent',
  });

  // "Recently added" is deduced the same way: Subsonic doesn't give artist
  // creation date, so they're sorted by how recent their newest album is
  // (getAlbumList 'newest'). Approximate, but it's the only signal available.
  const { data: newestAlbums } = useQuery({
    queryKey: ['albumList', 'newest', FREQUENT_POOL],
    queryFn: () => getAlbumList('newest', FREQUENT_POOL),
    enabled: canFetch && sort === 'newest',
  });

  // Scores by how high their best album is in that list. Those not appearing
  // stay at 0 and fall to alphabetical order.
  const scoreByBestAlbum = (albums: Album[] | undefined) => {
    const m = new Map<string, number>();
    (albums ?? []).forEach((al, i) => {
      const id = al.artistId;
      if (!id) return;
      const score = FREQUENT_POOL - i;
      if ((m.get(id) ?? 0) < score) m.set(id, score);
    });
    return m;
  };
  const playedByArtist = useMemo(() => scoreByBestAlbum(frequentAlbums), [frequentAlbums]);
  const addedByArtist = useMemo(() => scoreByBestAlbum(newestAlbums), [newestAlbums]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (data ?? []).filter((a) => a.name.toLowerCase().includes(q)) : (data ?? []);
  }, [data, query]);

  // Shuffled in its own memo, NOT depending on times/byArtist: the history
  // records every song that starts, so with music playing those deps change
  // every track and the Fisher-Yates would re-execute — the grid would
  // reshuffle itself in front of the user on every song change.
  const shuffledArtists = useMemo(() => {
    if (sort !== 'random') return null;
    const arr = filtered.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [filtered, sort]);

  const artists = useMemo(() => {
    if (sort === 'random') return shuffledArtists ?? [];
    const all = filtered.slice();
    const byName = (a: Artist, b: Artist) => a.name.localeCompare(b.name);
    if (sort === 'alpha') return all.sort(byName);
    const score =
      sort === 'frequent'
        ? (a: Artist) => playedByArtist.get(a.id) ?? 0
        : sort === 'newest'
          ? (a: Artist) => addedByArtist.get(a.id) ?? 0
          : (a: Artist) => Math.max(times[`/artist/${a.id}`] ?? 0, byArtist.get(a.id) ?? 0);
    // Tie-break → alphabetical, so the many artists with no plays or counted
    // albums don't get an arbitrary order.
    return all.sort((a, b) => score(b) - score(a) || byName(a, b));
  }, [filtered, sort, shuffledArtists, times, byArtist, playedByArtist, addedByArtist]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel={t('Back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('Artists')}</Text>
        {/* Takes the same width as the back chevron so the title stays centered;
            there used to be an empty slot of the same width here. */}
        <View style={styles.headerAction}>
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={grid ? t('List view') : t('Grid view')}
            onPress={() => setLayout(grid ? 'list' : 'grid')}
          >
            <Ionicons
              name={grid ? 'list' : 'grid-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      {/* Collapsed = height 0 (invisible). Clipping goes in a container without
          padding: any padding would impose a minimum height and show a sliver
          with the bar closed. */}
      <Animated.View style={[styles.searchClip, { height: searchH }]}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder={t('Filter artists')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearching(true)}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('Clear')}
                onPress={() => setQuery('')}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {searching ? (
            <Pressable hitSlop={8} accessibilityRole="button" onPress={cancelSearch}>
              <Text style={styles.searchCancel}>{t('Cancel')}</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsRow}
      >
        {SORTS.map((s) => {
          const active = s.key === sort;
          return (
            <Pressable
              key={s.key}
              style={[styles.chip, active && { backgroundColor: colors.accent }]}
              onPress={() => setSort(s.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(s.label)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        grid ? (
          <ArtistGridSkeleton width={CARD} />
        ) : (
          <ArtistListSkeleton />
        )
      ) : isError ? (
        <Message text={t("Couldn't load artists.")} onRetry={() => refetch()} />
      ) : (
        <GestureDetector gesture={revealPan}>
        <GHFlatList
        {...listPerf}
          ref={listRef}
          simultaneousHandlers={revealPanRef}
          data={artists}
          // Remount the list when changing sort or layout: otherwise FlatList
          // reuses rows and gets stuck with stale ones (numColumns also doesn't
          // support hot-swapping).
          key={`${sort}-${layout}`}
          keyExtractor={(item) => item.id}
          {...(grid
            ? { numColumns: COLUMNS, columnWrapperStyle: { gap: GAP }, contentContainerStyle: styles.list }
            : { contentContainerStyle: styles.rowList })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = e.nativeEvent.contentOffset.y;
            lastOffsetY.current = y;
            // Scrolling down with the bar open collapses it again; with focus
            // set it doesn't, or an active filter would be hidden.
            if (revealed && !searching && y > 30) collapseSearchBar();
          }}
          renderItem={({ item }: { item: Artist }) =>
            grid ? <ArtistCard artist={item} width={CARD} /> : <ArtistRow artist={item} />
          }
          ListEmptyComponent={
            query.trim() ? (
              <EmptyState
                icon="search-outline"
                title={t('No results')}
                subtitle={t('No results for “{q}”', { q: query.trim() })}
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title={t('No artists yet')}
                subtitle={t('Your library looks empty.')}
              />
            )
          }
        />
        </GestureDetector>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  searchClip: { overflow: 'hidden' },
  searchRow: {
    height: SEARCH_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    // The gap to the chips goes inside the animated height: this way it
    // collapses with the bar (an outer margin would remain visible).
    paddingBottom: spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  input: { flex: 1, color: colors.text, fontSize: fontSize.md, paddingVertical: 0 },
  searchCancel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  headerAction: { width: 26, alignItems: 'flex-end' },
  // Same chips as exploring albums, fine adjustments included. `flexShrink: 0`
  // because the search bar adds a child to the column: without it flex
  // shrinks this row and clips the pill text.
  chipsRow: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: {
    // Asymmetric padding on purpose: even without includeFontPadding, glyphs
    // end up ~1dp low relative to the pill center (measured in screenshot).
    paddingTop: spacing.xs - 1,
    paddingBottom: spacing.xs + 1,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceHighlight,
    justifyContent: 'center',
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    // Android adds extra asymmetric padding on top of the text (font ascent):
    // without removing it, the text doesn't center in the pill.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  chipTextActive: { color: '#000' },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: SCREEN_BOTTOM_PADDING,
    gap: GAP,
  },
  // In rows the gap between cards is tight: the Library ones breathe with
  // spacing.lg and these are the same.
  rowList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: SCREEN_BOTTOM_PADDING,
    gap: spacing.lg,
  },
});
