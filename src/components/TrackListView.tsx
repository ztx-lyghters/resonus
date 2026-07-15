/**
 * Cabecera estilo Spotify (degradado de color dominante + carátula que se
 * desvanece al hacer scroll y barra fija que se colapsa) y la lista de
 * canciones. Compartida por las pantallas de álbum y de lista de reproducción.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
// La lista debe ser de gesture-handler para que el swipe-a-cola de las filas
// no pelee con el scroll vertical (con la FlatList de RN el gesto sale flaky).
import {
  FlatList as GHFlatList,
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Song, type StarType } from '@/api/subsonic';
import { useDominantColor } from '@/hooks/useDominantColor';
import { useT } from '@/i18n';
import { artistTargets } from '@/lib/artistNav';
import { haptic } from '@/lib/haptics';
import { listPerf } from '@/lib/listPerf';
import { useArtistPicker } from '@/store/artistPicker';
import { usePlayerStore } from '@/store/player';
import { colors, fontSize, radius, spacing, SCREEN_BOTTOM_PADDING } from '@/theme';
import { Cover } from './Cover';
import { FavoriteButton } from './FavoriteButton';
import { TrackRow } from './TrackRow';

const COVER = Math.min(Dimensions.get('window').width * 0.58, 250);
const TOPBAR_H = 48;
/** Alto de la barra de búsqueda oculta (estilo "Find in playlist" de Spotify),
 * con el aire de separación respecto a la carátula incluido. */
const SEARCH_H = 72;

/** Normaliza para buscar: minúsculas y sin acentos. */
function normQ(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

interface Props {
  title: string;
  subtitle?: string;
  /** Si se indica, el subtítulo lleva al artista al pulsarlo. */
  artistId?: string;
  /** Artistas del álbum; con varios, el subtítulo abre el selector. */
  artists?: { id: string; name: string }[];
  /** Foto circular del artista junto al subtítulo (estilo Spotify). */
  artistImageUri?: string;
  /** Línea de metadatos (p. ej. "Álbum · 2021 · 12 canciones · 48 min"). */
  meta?: string;
  coverUri?: string;
  /** Carátula personalizada (p. ej. el arte de Favoritos); sustituye a coverUri. */
  renderCover?: (size: number) => ReactNode;
  /** Si se pasa, la carátula es pulsable (p. ej. abrir el visor a pantalla completa). */
  onCoverPress?: () => void;
  /** Oculta la carátula de la cabecera y recupera ese espacio (p. ej. Favoritos). */
  hideCover?: boolean;
  /** Color del degradado/barra si no hay carátula con color dominante. */
  accentColor?: string;
  songs: Song[];
  currentId?: string;
  /** Numera las pistas (útil en álbumes). */
  numbered?: boolean;
  /** Si se indica, muestra un corazón para marcar el álbum como favorito. */
  favorite?: { id: string; type: StarType; starred: boolean };
  /** Botón de descarga sin conexión (cabecera de álbum/playlist). */
  download?: {
    status: 'none' | 'active' | 'done';
    /** Progreso 0..1 mientras `status` es 'active'. */
    progress: number;
    onPress: () => void;
  };
  /** Si se indica, muestra un botón ⋯. */
  onMenu?: () => void;
  /** Si se indica, el menú de cada canción permite quitarla de esta playlist. */
  playlistId?: string;
  /** Índice real (en el servidor) de cada canción, por si la lista va reordenada. */
  playlistIndices?: number[];
  /** Si se indica, muestra un botón de orden a la izquierda del ⋯. */
  onSort?: () => void;
  /** Fila "+ Añadir…" bajo las acciones (estilo Spotify), p. ej. en Favoritos. */
  addAction?: { label: string; onPress: () => void };
  /** Contenido extra al pie de la lista (p. ej. "Más de este artista"). */
  footer?: ReactNode;
  /** Qué mostrar bajo la cabecera cuando no hay canciones (p. ej. playlist vacía). */
  emptyState?: ReactNode;
  /** Muestra la mini carátula del álbum en cada fila (playlists/favoritos). */
  showArtwork?: boolean;
  /**
   * Barra "buscar en la lista" oculta sobre la cabecera: se revela tirando
   * hacia abajo desde arriba del todo (gesto estilo Spotify).
   */
  searchable?: boolean;
  /** Texto guía de la barra de búsqueda (por defecto "Buscar en la lista"). */
  searchPlaceholder?: string;
  /**
   * Habilita la selección múltiple (entrar con pulsación larga en una fila).
   * Cada acción recibe las canciones marcadas; `indices` son sus posiciones
   * reales (vía `playlistIndices` si la lista va reordenada).
   */
  selection?: {
    /** Quitar de esta lista (playlist: por índice; favoritos: unstar). */
    onRemove?: (songs: Song[], indices: number[]) => void;
    /** Añadir a otra playlist. */
    onAddTo?: (songs: Song[]) => void;
    /** Descargar en lote. */
    onDownload?: (songs: Song[]) => void;
  };
  onPlay: (startIndex: number) => void | Promise<void>;
}

export function TrackListView({
  title,
  subtitle,
  artistId,
  artists,
  artistImageUri,
  meta,
  coverUri,
  renderCover,
  onCoverPress,
  hideCover,
  accentColor,
  songs,
  currentId,
  numbered,
  favorite,
  download,
  onMenu,
  playlistId,
  playlistIndices,
  onSort,
  addAction,
  footer,
  emptyState,
  showArtwork,
  searchable,
  searchPlaceholder,
  selection,
  onPlay,
}: Props) {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const dominant = useDominantColor(coverUri);
  const headerColor = accentColor ?? dominant;
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  // El botón de aleatorio se tiñe solo si esta lista es la que está sonando; si
  // no, el modo aleatorio (global) teñía también los botones de álbumes/listas
  // ajenos, que despistaba.
  const shuffleActive = useMemo(
    () => shuffle && !!currentId && songs.some((s) => s.id === currentId),
    [shuffle, currentId, songs],
  );
  const openArtistPicker = useArtistPicker((s) => s.open);
  const subtitleTargets = artistTargets({ artistId, artists });
  const onSubtitlePress =
    subtitleTargets.length > 1
      ? () => openArtistPicker(subtitleTargets)
      : subtitleTargets.length === 1
        ? () => router.push(`/artist/${subtitleTargets[0].id}`)
        : undefined;

  const scrollY = useRef(new Animated.Value(0)).current;

  // ── Búsqueda dentro de la lista ─────────────────────────────────────────
  // La barra se renderiza plegada (altura 0) encima de la cabecera; un gesto
  // de tirar hacia abajo con la lista arriba del todo la despliega, y volver
  // a scrollear la pliega. Como el "Find in playlist" de Spotify.
  const listRef = useRef<GHFlatList<Song>>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [revealed, setRevealed] = useState(false);
  /** Último offset real del scroll (el gesto solo revela estando arriba). */
  const lastOffsetY = useRef(0);
  const searchH = useRef(new Animated.Value(0)).current;
  const searchBar = !!searchable && songs.length > 0;

  function revealSearchBar() {
    haptic('light');
    setRevealed(true);
    Animated.timing(searchH, { toValue: SEARCH_H, duration: 200, useNativeDriver: false }).start();
  }

  function collapseSearchBar() {
    setRevealed(false);
    Animated.timing(searchH, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }

  // Pan simultáneo con el scroll de la lista: no roba el gesto, solo observa.
  // Android no da eventos de overscroll (la lista clava el offset en 0), así
  // que el "tirar hacia abajo estando arriba" hay que detectarlo aparte. La
  // simultaneidad se declara en la lista (prop simultaneousHandlers con el ref
  // del gesto): sin ella el scroll nativo cancela este Pan antes de activarse.
  const revealPanRef = useRef<GestureType | undefined>(undefined);
  const revealPan = Gesture.Pan()
    .withRef(revealPanRef)
    .runOnJS(true)
    // Solo arrastres hacia abajo: los hacia arriba (scroll normal) lo anulan.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onChange((e) => {
      if (!searchBar || searching || revealed) return;
      if (lastOffsetY.current <= 1 && e.translationY > 60) revealSearchBar();
    });

  // ── Selección múltiple ──────────────────────────────────────────────────
  // null = modo normal; un Set (aunque esté vacío) = seleccionando.
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const selecting = selectedIds !== null;
  // Id que acaba de entrar en selección por long-press. Al soltar, el `onPress`
  // de ese mismo gesto llega con `selecting` ya activo y desharía la selección;
  // lo descartamos una vez. Se resetea en `onPressIn` (arranque de cada pulsa-
  // ción), así no queda residuo aunque `onPress` no salte tras el long-press.
  const justLongPressed = useRef<string | null>(null);
  const allSelected = selecting && selectedIds.size === songs.length && songs.length > 0;

  function toggleSelect(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Ejecuta una acción del modo selección con lo marcado y sale del modo. */
  function runSelectionAction(fn: (sel: Song[], indices: number[]) => void) {
    const sel: Song[] = [];
    const indices: number[] = [];
    songs.forEach((s, i) => {
      if (selectedIds?.has(s.id)) {
        sel.push(s);
        indices.push(playlistIndices ? playlistIndices[i] : i);
      }
    });
    setSelectedIds(null);
    if (sel.length > 0) fn(sel, indices);
  }

  // Sin carátula la cabecera es más corta: el degradado y el colapso de la
  // barra se ajustan a una distancia menor para que la transición cuadre.
  const cover = hideCover ? 0 : COVER;
  const collapse = hideCover ? 120 : COVER;
  // La cola del degradado muere más o menos donde acaba la cabecera (título +
  // acciones): funde el color con el negro de la lista sin llegar a teñir la
  // primera fila (probado: alargarlo hasta las filas se veía sucio).
  const gradientH = insets.top + TOPBAR_H + cover + 120;
  const coverOpacity = scrollY.interpolate({
    inputRange: [0, collapse * 0.7],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const barContentOpacity = scrollY.interpolate({
    inputRange: [collapse * 0.5, collapse * 0.85],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const barBgOpacity = scrollY.interpolate({
    inputRange: [0, collapse * 0.85],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Filtrado en vivo; conserva el índice original de cada canción para que
  // reproducir/encolar/quitar sigan apuntando a la posición correcta.
  const filtered = useMemo(() => {
    const q = normQ(query.trim());
    if (!searchable || !q) return null;
    const rows: { song: Song; index: number }[] = [];
    songs.forEach((song, index) => {
      if (normQ(song.title).includes(q) || (song.artist && normQ(song.artist).includes(q)))
        rows.push({ song, index });
    });
    return rows;
  }, [searchable, query, songs]);
  const shownSongs = useMemo(
    () => (filtered ? filtered.map((r) => r.song) : songs),
    [filtered, songs],
  );

  function cancelSearch() {
    Keyboard.dismiss();
    setQuery('');
    setSearching(false);
    collapseSearchBar();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  async function shufflePlay() {
    if (songs.length === 0) return;
    // Arranca en una pista aleatoria y, una vez cargada, activa el modo
    // aleatorio. Hay que ESPERAR a que playQueue (dentro de onPlay) termine:
    // si no, su escritura asíncrona del índice pisa el reordenado de
    // toggleShuffle y el reproductor acaba mostrando una canción distinta de la
    // que suena. Leemos shuffle fresco con getState() porque playQueue lo
    // resetea a false.
    await onPlay(Math.floor(Math.random() * songs.length));
    if (!usePlayerStore.getState().shuffle) toggleShuffle();
  }

  return (
    <View style={styles.root}>
      {/* Degradado de color dominante; hace parallax 1:1 con el scroll. En
          modo búsqueda no se pinta: la pantalla queda en negro plano. */}
      {searching ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.gradientWrap,
            {
              height: gradientH,
              // Sigue el scroll 1:1 y baja con la barra de búsqueda desplegada
              // (que empuja la cabecera hacia abajo sin mover el offset).
              transform: [{ translateY: Animated.add(searchH, Animated.multiply(scrollY, -1)) }],
            },
          ]}
        >
          {/* Banda de color sobre el degradado: al revelar la barra de búsqueda
              el contenido baja SEARCH_H px y esto llena el hueco de arriba. */}
          {searchable ? (
            <View style={[styles.gradientAbove, { backgroundColor: headerColor }]} />
          ) : null}
          <LinearGradient
            colors={[headerColor, colors.background]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      <GestureDetector gesture={revealPan}>
      <GHFlatList
        ref={listRef}
        simultaneousHandlers={revealPanRef}
        {...listPerf}
        data={shownSongs}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + TOPBAR_H + spacing.md },
        ]}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
          listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = e.nativeEvent.contentOffset.y;
            lastOffsetY.current = y;
            // Scrollear hacia abajo con la barra fuera la vuelve a plegar.
            if (revealed && !searching && y > 30) collapseSearchBar();
          },
        })}
        ListHeaderComponent={
          <View>
            {searchBar ? (
              /* Plegada = altura 0 (invisible); el gesto la despliega. El
                 recorte va en un contenedor sin padding: cualquier padding
                 impondría una altura mínima y asomaría una rendija. */
              <Animated.View style={[styles.searchClip, { height: searchH }]}>
              <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={colors.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={searchPlaceholder ?? t('Find in playlist')}
                    placeholderTextColor={colors.textSecondary}
                    value={query}
                    onChangeText={setQuery}
                    onFocus={() => setSearching(true)}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {query.length > 0 ? (
                    <Pressable
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('Clear')}
                      onPress={() => setQuery('')}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
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
            ) : null}
            {/* Buscando, la cabecera grande se aparta: los resultados quedan
                pegados a la barra, que es lo que hace Spotify. */}
            {searching ? null : (
          <View style={styles.header}>
            {hideCover ? null : (
              <Animated.View style={[styles.coverCenter, { opacity: coverOpacity }]}>
                {onCoverPress ? (
                  <Pressable
                    onPress={onCoverPress}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('View cover')}
                  >
                    {renderCover ? renderCover(COVER) : <Cover uri={coverUri} size={COVER} />}
                  </Pressable>
                ) : renderCover ? (
                  renderCover(COVER)
                ) : (
                  <Cover uri={coverUri} size={COVER} />
                )}
              </Animated.View>
            )}
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              onSubtitlePress ? (
                <Pressable hitSlop={6} style={styles.subtitleRow} onPress={onSubtitlePress}>
                  {artistImageUri ? (
                    <View style={styles.artistPhoto}>
                      <Cover uri={artistImageUri} size={24} />
                    </View>
                  ) : null}
                  <Text style={[styles.subtitle, styles.subtitleLink]}>{subtitle}</Text>
                </Pressable>
              ) : (
                <Text style={styles.subtitle}>{subtitle}</Text>
              )
            ) : null}
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}

            <View style={styles.actions}>
              <View style={styles.actionsLeft}>
                {favorite ? (
                  <FavoriteButton
                    id={favorite.id}
                    type={favorite.type}
                    starred={favorite.starred}
                    size={28}
                  />
                ) : null}
                {download ? (
                  <Pressable
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={
                      download.status === 'done' ? t('Remove download') : t('Download')
                    }
                    onPress={download.onPress}
                    style={styles.downloadWrap}
                  >
                    {download.status === 'active' ? (
                      <>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={[styles.downloadProgress, { color: colors.accent }]}>
                          {Math.round(download.progress * 100)}%
                        </Text>
                      </>
                    ) : (
                      <Ionicons
                        name={
                          download.status === 'done'
                            ? 'arrow-down-circle'
                            : 'arrow-down-circle-outline'
                        }
                        size={26}
                        color={download.status === 'done' ? colors.accent : colors.textSecondary}
                      />
                    )}
                  </Pressable>
                ) : null}
                {onSort ? (
                  <Pressable
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('Sort')}
                    onPress={onSort}
                  >
                    <Ionicons name="swap-vertical" size={24} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
                {onMenu ? (
                  <Pressable
                    hitSlop={10}
                    style={styles.menuButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('More options')}
                    onPress={onMenu}
                  >
                    <Ionicons name="ellipsis-horizontal" size={26} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.actionsRight}>
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('Shuffle')}
                  onPress={shufflePlay}
                >
                  <Ionicons
                    name="shuffle"
                    size={26}
                    color={shuffleActive ? colors.accent : colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  style={[styles.playButton, { backgroundColor: colors.accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('Play')}
                  onPress={() => songs.length > 0 && onPlay(0)}
                >
                  <Ionicons name="play" size={28} color="#000" style={{ marginLeft: 3 }} />
                </Pressable>
              </View>
            </View>

            {addAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={addAction.onPress}
                style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.addBox}>
                  <Ionicons name="add" size={26} color={colors.textSecondary} />
                </View>
                <Text style={styles.addLabel}>{addAction.label}</Text>
              </Pressable>
            ) : null}
          </View>
            )}
          </View>
        }
        extraData={selectedIds}
        renderItem={({ item, index }) => {
          // Con filtro activo, `index` es la posición en los resultados; todo
          // lo demás (reproducir, quitar, numerar) usa la posición original.
          const origIndex = filtered ? filtered[index].index : index;
          return (
            <TrackRow
              song={item}
              // Con carátula visible se omite el número: el álbum queda como
              // siempre (solo Populares del artista muestra número + portada).
              position={numbered && !showArtwork ? item.track ?? origIndex + 1 : undefined}
              isCurrent={currentId === item.id}
              showArtwork={showArtwork}
              menuContext={
                playlistId
                  ? { playlistId, index: playlistIndices ? playlistIndices[origIndex] : origIndex }
                  : undefined
              }
              selecting={selecting}
              selected={!!selectedIds?.has(item.id)}
              onPressIn={() => {
                justLongPressed.current = null;
              }}
              onLongPress={
                selection && !selecting
                  ? () => {
                      haptic('medium');
                      setSelectedIds(new Set([item.id]));
                      justLongPressed.current = item.id;
                    }
                  : undefined
              }
              onPress={() => {
                // Descarta el onPress que sigue al long-press de seleccionar:
                // si no, desmarcaría la canción con la que entraste en selección.
                if (justLongPressed.current === item.id) return;
                if (selecting) toggleSelect(item.id);
                else onPlay(origIndex);
              }}
            />
          );
        }}
        ListEmptyComponent={
          filtered ? (
            <Text style={styles.noResults}>{t('No results for “{q}”', { q: query.trim() })}</Text>
          ) : emptyState ? (
            <>{emptyState}</>
          ) : null
        }
        ListFooterComponent={footer ? <>{footer}</> : null}
      />
      </GestureDetector>

      {/* Barra fija superior: el fondo y el título aparecen al colapsar. En
          modo selección se sustituye por ✕ + contador + seleccionar todo. */}
      <View style={[styles.bar, { height: insets.top + TOPBAR_H, paddingTop: insets.top }]}>
        {selecting ? (
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: headerColor }]} />
            <Pressable
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('Close')}
              onPress={() => setSelectedIds(null)}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.barTitle} numberOfLines={1}>
              {t('{n} selected', { n: selectedIds.size })}
            </Text>
            <Pressable
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('Select all')}
              onPress={() =>
                setSelectedIds(allSelected ? new Set() : new Set(songs.map((s) => s.id)))
              }
            >
              <Ionicons
                name="checkmark-done"
                size={24}
                color={allSelected ? colors.accent : colors.text}
              />
            </Pressable>
          </>
        ) : (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: headerColor, opacity: barBgOpacity },
              ]}
            />
            <Pressable
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('Close')}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Animated.Text
              style={[styles.barTitle, { opacity: barContentOpacity }]}
              numberOfLines={1}
            >
              {title}
            </Animated.Text>
          </>
        )}
      </View>

      {/* Barra flotante de acciones del modo selección (sobre el mini player,
          a la altura del toast). */}
      {selecting ? (
        <View style={[styles.selectionBar, { bottom: insets.bottom + 96 }]}>
          {selection?.onAddTo ? (
            <SelectionAction
              icon="add-circle-outline"
              label={t('Add to a playlist')}
              enabled={selectedIds.size > 0}
              onPress={() => runSelectionAction((sel) => selection.onAddTo!(sel))}
            />
          ) : null}
          {selection?.onDownload ? (
            <SelectionAction
              icon="download-outline"
              label={t('Download')}
              enabled={selectedIds.size > 0}
              onPress={() => runSelectionAction((sel) => selection.onDownload!(sel))}
            />
          ) : null}
          {selection?.onRemove ? (
            <SelectionAction
              icon="remove-circle-outline"
              label={t('Remove')}
              enabled={selectedIds.size > 0}
              onPress={() => runSelectionAction((sel, idx) => selection.onRemove!(sel, idx))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Botón (icono + etiqueta) de la barra flotante del modo selección. */
function SelectionAction({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.selectionAction,
        (pressed || !enabled) && { opacity: 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={onPress}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={styles.selectionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gradientWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  gradientAbove: {
    position: 'absolute',
    top: -SEARCH_H * 4,
    left: 0,
    right: 0,
    height: SEARCH_H * 4,
  },
  searchClip: {
    overflow: 'hidden',
  },
  searchRow: {
    height: SEARCH_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // La separación con la carátula va dentro del alto animado: así se pliega
    // junto con la barra (un margen exterior quedaría siempre visible).
    paddingBottom: spacing.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Translúcido para dejar pasar el color dominante de la cabecera (Spotify).
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    paddingVertical: 0,
  },
  searchCancel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  noResults: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  addBox: {
    width: 48,
    height: 48,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: SCREEN_BOTTOM_PADDING,
  },
  header: {
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  coverCenter: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  subtitleLink: {
    color: colors.text,
    fontWeight: '700',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
  },
  artistPhoto: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  menuButton: {
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  downloadWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  downloadProgress: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '600',
    minWidth: 32,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  playButton: {
    backgroundColor: colors.accent,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  barTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  selectionBar: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    backgroundColor: '#2E2E2E',
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  selectionAction: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  selectionLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
