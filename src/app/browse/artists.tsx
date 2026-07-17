/** Explorar todos los artistas del servidor, con filtro rápido. */
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

import { getAlbumList, getArtists, type Artist } from '@/api/data';
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

// Tres columnas, como la rejilla de la Biblioteca: los círculos salen a ~121dp,
// casi los 130 con los que Inicio pinta artistas. A dos columnas (la rejilla de
// álbumes) se iban a 186dp y solo cabían cuatro por pantalla, que con 500
// artistas es un scroll eterno. Un álbum se reconoce por la portada y merece
// tamaño; un artista se reconoce por la cara mucho antes.
const COLUMNS = 3;
const GAP = spacing.sm;
const CARD = (Dimensions.get('window').width - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

/**
 * Ordenaciones, en cliente: `getArtists()` trae el índice entero de una y
 * alfabético, y Subsonic no ofrece otro orden para artistas (a diferencia de
 * los álbumes, donde ordena el servidor). Como ya están todos aquí, ordenar
 * sale gratis.
 */
type ArtistSort = 'alpha' | 'recent' | 'frequent' | 'random';

const SORTS: { key: ArtistSort; label: string }[] = [
  { key: 'alpha', label: 'A-Z' },
  { key: 'recent', label: 'Recent' },
  { key: 'frequent', label: 'Most played' },
  { key: 'random', label: 'Shuffle' },
];

/** Cuántos álbumes frecuentes se miran para deducir tus artistas. */
const FREQUENT_POOL = 50;

/** Alto de la barra desplegada: la caja (44) más su separación con los chips. */
const SEARCH_H = 44 + spacing.md;

export default function BrowseArtistsScreen() {
  const router = useRouter();
  const t = useT();
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ArtistSort>('alpha');
  const layout = useSettings((s) => s.browseArtistsLayout);
  const setLayout = useSettings((s) => s.setBrowseArtistsLayout);
  const grid = layout === 'grid';

  // "Recientes" mezcla las dos fuentes: haber abierto su pantalla y haber
  // sonado dentro de cualquier cola. Ninguna sola cuenta la historia entera.
  const times = useLastPlayed((s) => s.times);
  const { byArtist } = useHistoryTimes();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['allArtists'],
    queryFn: () => getArtists(),
    enabled: canFetch,
  });

  // ── Búsqueda al tirar hacia abajo ───────────────────────────────────────
  // Mismo gesto que las listas de canciones (TrackListView): la barra se pinta
  // plegada (alto 0) sobre los chips y tirar de la rejilla estando arriba la
  // despliega. Aquí es hermana de la lista, no cabecera suya: los chips van en
  // medio y deben quedarse fijos, así que la barra no puede vivir dentro del
  // scroll. Crecer empuja chips y rejilla igual, que es el efecto buscado.
  const listRef = useRef<GHFlatList<Artist>>(null);
  const [searching, setSearching] = useState(false);
  const [revealed, setRevealed] = useState(false);
  /** Último offset real del scroll (el gesto solo revela estando arriba). */
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
      // Sin artistas no hay nada que filtrar; con el foco puesto o ya desplegada
      // no hay nada que revelar.
      if (searching || revealed || (data?.length ?? 0) === 0) return;
      if (lastOffsetY.current <= 1 && e.translationY > 60) revealSearchBar();
    });

  /**
   * "Más escuchados" se deduce de tus álbumes más escuchados: Subsonic no
   * ordena artistas por reproducciones, y los contadores locales van por id de
   * canción sin metadatos, así que no se pueden agrupar por artista. Es el
   * mismo apaño que `getMostPlayedSongs` ya hace con las canciones. Solo se
   * pide al elegir este orden.
   */
  const { data: frequentAlbums } = useQuery({
    queryKey: ['albumList', 'frequent', FREQUENT_POOL],
    queryFn: () => getAlbumList('frequent', FREQUENT_POOL),
    enabled: canFetch && sort === 'frequent',
  });

  // Puntúa por lo arriba que esté su mejor álbum en esa lista. Los que no
  // aparecen quedan a 0 y caen al orden alfabético.
  const playedByArtist = useMemo(() => {
    const m = new Map<string, number>();
    (frequentAlbums ?? []).forEach((al, i) => {
      const id = al.artistId;
      if (!id) return;
      const score = FREQUENT_POOL - i;
      if ((m.get(id) ?? 0) < score) m.set(id, score);
    });
    return m;
  }, [frequentAlbums]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (data ?? []).filter((a) => a.name.toLowerCase().includes(q)) : (data ?? []);
  }, [data, query]);

  // Barajado en su propio memo, SIN depender de times/byArtist: el historial
  // registra cada canción que empieza, así que con música sonando esas deps
  // cambian a cada pista y el Fisher-Yates se re-ejecutaba — la rejilla se
  // rebarajaba sola delante del usuario a cada cambio de canción.
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
        : (a: Artist) => Math.max(times[`/artist/${a.id}`] ?? 0, byArtist.get(a.id) ?? 0);
    // Empate → alfabético, para que no salga un orden arbitrario entre los
    // muchos artistas sin escuchas ni álbumes contados.
    return all.sort((a, b) => score(b) - score(a) || byName(a, b));
  }, [filtered, sort, shuffledArtists, times, byArtist, playedByArtist]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel={t('Back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('Artists')}</Text>
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
          // Remonta la lista al cambiar de orden o de disposición: si no,
          // FlatList reaprovecha las filas y se queda a medias con las viejas
          // (numColumns tampoco admite cambiar en caliente).
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
            // Scrollear hacia abajo con la barra fuera la vuelve a plegar; con
            // el foco puesto no, o un filtro activo quedaría escondido.
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
  headerAction: { width: 26, alignItems: 'flex-end' },
  // Mismos chips que explorar álbumes, ajustes finos incluidos. `flexShrink: 0`
  // porque la barra de búsqueda añade un hijo a la columna: sin él el flex
  // encoge esta fila y corta el texto de las píldoras.
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
