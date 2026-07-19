/** Explorar todos los álbumes del servidor, con orden, búsqueda y scroll infinito. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { getAlbumList, searchAlbums, type Album, type AlbumListType } from '@/api/data';
import { AlbumCard } from '@/components/AlbumCard';
import { AlbumCardsSkeleton } from '@/components/AlbumCardsSkeleton';
import { AlbumRow } from '@/components/AlbumRow';
import { AlbumRowsSkeleton } from '@/components/AlbumRowsSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { Message } from '@/components/Message';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { colors, fontSize, radius, spacing, SCREEN_BOTTOM_PADDING } from '@/theme';
import { haptic } from '@/lib/haptics';
import { listPerf } from '@/lib/listPerf';

const PAGE = 30;
const COLUMNS = 2;
const GAP = spacing.sm;
const CARD = (Dimensions.get('window').width - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

/** Alto de la barra desplegada: la caja (44) más su separación con los chips. */
const SEARCH_H = 44 + spacing.md;

/**
 * Tope de resultados. La lista normal pagina, pero los de búsqueda no: hay que
 * escribir más, no scrollear más. 50 es de sobra para encontrar un álbum sin
 * pedirle al servidor cientos que nadie va a mirar.
 */
const SEARCH_COUNT = 50;

/** Espera antes de preguntar al servidor: sin esto sería una petición por tecla. */
const DEBOUNCE_MS = 300;

// Mismos chips y mismo orden que en Artistas: son pantallas hermanas y verlas
// ordenadas distinto chirriaba. 'alphabeticalByArtist' se cayó por eso, por
// simetría: no tiene equivalente en Artistas, donde ordenar por artista es
// justo lo que ya hace A-Z.
const SORTS: { key: AlbumListType; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'alphabeticalByName', label: 'A-Z' },
  { key: 'frequent', label: 'Most played' },
  { key: 'random', label: 'Shuffle' },
];

export default function BrowseAlbumsScreen() {
  const router = useRouter();
  const t = useT();
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const [sort, setSort] = useState<AlbumListType>('recent');
  const layout = useSettings((s) => s.browseAlbumsLayout);
  const setLayout = useSettings((s) => s.setBrowseAlbumsLayout);
  const grid = layout === 'grid';

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['browseAlbums', sort],
      queryFn: ({ pageParam }) => getAlbumList(sort, PAGE, pageParam),
      initialPageParam: 0,
      getNextPageParam: (last, pages) =>
        last.length === PAGE ? pages.length * PAGE : undefined,
      enabled: canFetch,
    });

  // ── Búsqueda al tirar hacia abajo ───────────────────────────────────────
  // Mismo gesto y misma barra que al explorar artistas, pero por dentro no es
  // un filtro: allí `getArtists` trae el índice entero, así que filtrar en
  // cliente es exacto. Aquí la lista pagina de PAGE en PAGE, y filtrar lo
  // cargado solo miraría las páginas ya scrolleadas — parecería funcionar y se
  // dejaría fuera media biblioteca. Así que pregunta al servidor.
  const listRef = useRef<GHFlatList<Album>>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [revealed, setRevealed] = useState(false);
  /** Último offset real del scroll (el gesto solo revela estando arriba). */
  const lastOffsetY = useRef(0);
  const searchH = useRef(new Animated.Value(0)).current;

  // El texto va por delante de lo que se pregunta: se escribe letra a letra y
  // cada una dispararía una petición.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const {
    data: results,
    isLoading: searchLoading,
    isError: searchError,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: ['searchAlbums', debounced],
    queryFn: () => searchAlbums(debounced, SEARCH_COUNT),
    enabled: canFetch && debounced.length > 0,
  });

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

  // Pan simultáneo con el scroll: no roba el gesto, solo observa. Android no da
  // eventos de overscroll (la lista clava el offset en 0), así que "tirar hacia
  // abajo estando arriba" hay que detectarlo aparte.
  const revealPanRef = useRef<GestureType | undefined>(undefined);
  const revealPan = Gesture.Pan()
    .withRef(revealPanRef)
    .runOnJS(true)
    // Solo arrastres hacia abajo: los hacia arriba (scroll normal) lo anulan.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onChange((e) => {
      if (searching || revealed) return;
      if (lastOffsetY.current <= 1 && e.translationY > 60) revealSearchBar();
    });

  // Buscando manda la búsqueda: el texto escrito, no el debounce, para que la
  // lista entera no reaparezca un instante entre tecla y tecla.
  const isSearch = query.trim().length > 0;
  const albums = isSearch ? (results ?? []) : (data?.pages.flat() ?? []);
  // Mientras el debounce no ha saltado la consulta sigue apagada, así que no
  // está "cargando" pero tampoco hay resultados: sin esto asomaría «Sin
  // resultados» entre tecla y tecla.
  const searchPending = isSearch && (searchLoading || debounced !== query.trim());

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel={t('Back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('Albums')}</Text>
        {/* Ocupa lo mismo que el chevron de volver para que el título siga
            centrado; antes había aquí un hueco vacío del mismo ancho. */}
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

      {/* Plegada = alto 0 (invisible). El recorte va en un contenedor sin
          padding: cualquier padding impondría un alto mínimo y asomaría una
          rendija con la barra cerrada. */}
      <Animated.View style={[styles.searchClip, { height: searchH }]}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder={t('Find an album')}
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

      {/* Los chips se apartan al buscar: el servidor devuelve por relevancia,
          así que ordenar los resultados no está en su mano y una píldora
          marcada mentiría sobre el orden que se ve. */}
      {isSearch ? null : (
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
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(s.label)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      )}

      {(isSearch ? searchPending : isLoading) ? (
        grid ? (
          <AlbumCardsSkeleton width={CARD} count={8} />
        ) : (
          <AlbumRowsSkeleton />
        )
      ) : isSearch && searchError ? (
        <Message text={t("Couldn't load albums.")} onRetry={() => refetchSearch()} />
      ) : isError ? (
        <Message text={t("Couldn't load albums.")} onRetry={() => refetch()} />
      ) : (
        <GestureDetector gesture={revealPan}>
        <GHFlatList
        {...listPerf}
          ref={listRef}
          simultaneousHandlers={revealPanRef}
          data={albums}
          // Remonta la lista al cambiar de orden o de disposición: si no,
          // FlatList reaprovecha las filas y se queda a medias con las viejas
          // (numColumns tampoco admite cambiar en caliente).
          key={`${sort}-${layout}`}
          keyExtractor={(item, i) => `${item.id}-${i}`}
          {...(grid
            ? { numColumns: COLUMNS, columnWrapperStyle: { gap: GAP }, contentContainerStyle: styles.list }
            : { contentContainerStyle: styles.rowList })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = e.nativeEvent.contentOffset.y;
            lastOffsetY.current = y;
            // Scrollear hacia abajo con la barra fuera la vuelve a plegar; con
            // el foco puesto no, o una búsqueda activa quedaría escondida.
            if (revealed && !searching && y > 30) collapseSearchBar();
          }}
          renderItem={({ item }: { item: Album }) =>
            grid ? <AlbumCard album={item} width={CARD} /> : <AlbumRow album={item} />
          }
          // Los resultados no paginan: son un tope, no una ventana. Pedir la
          // página siguiente al llegar al final traería la lista normal detrás.
          onEndReached={() => !isSearch && hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            !isSearch && isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.accent} />
            ) : null
          }
          ListEmptyComponent={
            isSearch ? (
              <EmptyState
                icon="search-outline"
                title={t('No results')}
                subtitle={t('No results for “{q}”', { q: query.trim() })}
              />
            ) : sort === 'frequent' || sort === 'recent' ? (
              <EmptyState
                icon="play-outline"
                title={t('Nothing played yet')}
                subtitle={
                  sort === 'recent'
                    ? t('Your recently played albums will show up here.')
                    : t('Your most played albums will show up here.')
                }
              />
            ) : (
              <EmptyState
                icon="disc-outline"
                title={t('No albums yet')}
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
  headerAction: { width: 26, alignItems: 'flex-end' },
  searchClip: { overflow: 'hidden' },
  searchRow: {
    height: SEARCH_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    // La separación con los chips va dentro del alto animado: así se pliega con
    // la barra (un margen exterior quedaría siempre visible).
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
  // `flexShrink: 0` porque la barra de búsqueda añade un hijo a la columna: sin
  // él el flex encoge esta fila y corta el texto de las píldoras.
  chipsRow: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: {
    // Padding asimétrico a propósito: aun sin includeFontPadding, los glifos
    // quedan ~1dp bajos respecto al centro de la píldora (medido en captura).
    paddingTop: spacing.xs - 1,
    paddingBottom: spacing.xs + 1,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    // Android mete relleno extra asimétrico sobre el texto (ascent de la
    // fuente): sin quitarlo, el texto no queda centrado en la píldora.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  chipTextActive: { color: '#000' },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: SCREEN_BOTTOM_PADDING,
    gap: GAP,
  },
  // En filas el hueco entre tarjetas se queda corto: las de la Biblioteca
  // respiran con spacing.lg y estas son las mismas.
  rowList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: SCREEN_BOTTOM_PADDING,
    gap: spacing.lg,
  },
});
