/**
 * Orden reutilizable de una lista de canciones (Recientes/Alfabético +
 * dirección) con su menú inferior. Lo usan playlist y favoritos.
 *
 * Devuelve la lista ya ordenada, el mapeo a los índices originales (para
 * acciones como "quitar de la lista"), un disparador para abrir el menú y el
 * propio menú como nodo a renderizar. Con `persistKey` el orden elegido se
 * guarda en disco y se recuerda entre visitas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ReactNode, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Song } from '@/api/subsonic';
import { SheetModal } from '@/components/SheetModal';
import { useT } from '@/i18n';
import {
  DEFAULT_SORT,
  useSortPrefs,
  type SortDir,
  type SortField,
  type SortPref,
} from '@/store/sortPrefs';
import { colors, fontSize, radius, spacing } from '@/theme';

const SORT_LABEL: Record<SortField, string> = {
  recent: 'Recent',
  added: 'Recently added',
  alpha: 'Alphabetical',
  artist: 'Artist',
  album: 'Album',
};

/** Campos ofrecidos por defecto (favoritos): 'recent' = orden del servidor. */
const DEFAULT_FIELDS: SortField[] = ['recent', 'alpha', 'artist', 'album'];

interface SortOptions {
  /** Qué campos ofrecer y en qué orden (el primero es el equivalente a "sin ordenar"). */
  fields?: SortField[];
  /** Etiquetas a medida por campo (p. ej. 'recent' → "Personalizado" en playlists). */
  labels?: Partial<Record<SortField, string>>;
  /** Orden por defecto si el usuario no ha elegido ninguno. */
  defaultSort?: SortPref;
}

interface SortResult {
  /** Canciones en el orden visible. */
  songs: Song[];
  /** Índice original (en el servidor) de cada canción visible. */
  indices: number[];
  /** Abre el menú de orden. */
  openSort: () => void;
  /** El menú de orden, para renderizar en el árbol. */
  sortSheet: ReactNode;
  /** Preferencia de orden actual (campo + dirección). */
  sort: SortPref;
  /** Cambia la preferencia de orden (p. ej. forzar el orden manual). */
  setSort: (pref: SortPref) => void;
}

/**
 * El menú vive en su propio componente (SheetModal, con su estado dentro):
 * abrirlo o cerrarlo solo re-renderiza el modal, no la pantalla (con su lista)
 * que usa el hook. Ese re-render era un delay visible al pulsar "Ordenar".
 */
const SortSheet = memo(function SortSheet({
  fields,
  labels,
  field,
  dir,
  update,
  openRef,
}: {
  fields: SortField[];
  labels?: Partial<Record<SortField, string>>;
  field: SortField;
  dir: SortDir;
  update: (next: SortPref) => void;
  openRef: React.MutableRefObject<() => void>;
}) {
  const t = useT();
  const labelFor = (f: SortField) => t(labels?.[f] ?? SORT_LABEL[f]);

  return (
    <SheetModal openRef={openRef}>
      {() => (
        <>
        <Text style={styles.sheetTitle}>{t('Sort by')}</Text>
        {fields.map((f) => {
          const active = field === f;
          return (
            <Pressable
              key={f}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              onPress={() => update({ field: f, dir })}
            >
              <Text style={[styles.actionText, active && { color: colors.accent }]}>
                {labelFor(f)}
              </Text>
              {active ? (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={colors.accent}
                  style={{ marginLeft: 'auto' }}
                />
              ) : null}
            </Pressable>
          );
        })}

        <View style={styles.divider} />
        <Text style={styles.sheetTitle}>{t('Direction')}</Text>
        <View style={styles.dirRow}>
          {(['asc', 'desc'] as SortDir[]).map((d) => {
            const active = dir === d;
            return (
              <Pressable
                key={d}
                style={[styles.dirChip, active && { backgroundColor: colors.accent }]}
                onPress={() => update({ field, dir: d })}
              >
                <Ionicons
                  name={d === 'asc' ? 'arrow-up' : 'arrow-down'}
                  size={16}
                  color={active ? '#000' : colors.text}
                />
                <Text style={[styles.dirChipText, active && { color: '#000' }]}>
                  {d === 'asc' ? t('Ascending') : t('Descending')}
                </Text>
              </Pressable>
            );
          })}
          </View>
        </>
      )}
    </SheetModal>
  );
});

export function useSongSort(
  source: Song[],
  persistKey?: string,
  options?: SortOptions,
): SortResult {
  const fields = options?.fields ?? DEFAULT_FIELDS;
  const fallback = options?.defaultSort ?? DEFAULT_SORT;
  const stored = useSortPrefs((s) => (persistKey ? s.prefs[persistKey] : undefined));
  const setPref = useSortPrefs((s) => s.setPref);
  const [local, setLocal] = useState<SortPref>(fallback);
  const openRef = useRef<() => void>(() => {});

  const { field, dir } = persistKey ? (stored ?? fallback) : local;
  function update(next: SortPref) {
    if (persistKey) setPref(persistKey, next, fallback);
    else setLocal(next);
  }

  // 'recent' deja el orden crudo del servidor (= orden manual de la playlist).
  // Memoizado: ordenar en cada render se nota en listas grandes.
  const ordered = useMemo(() => {
    const cmp = (a?: string, b?: string) => (a ?? '').localeCompare(b ?? '');
    const arr = source.map((song, idx) => ({ song, idx }));
    // 'added' = orden en que se añaden a la playlist. El servidor las añade al
    // final, así que su posición ya lo codifica: invertir = la última arriba.
    if (field === 'added') arr.reverse();
    if (field === 'alpha') arr.sort((a, b) => cmp(a.song.title, b.song.title));
    if (field === 'artist')
      arr.sort((a, b) => cmp(a.song.artist, b.song.artist) || cmp(a.song.title, b.song.title));
    if (field === 'album')
      // albumId separa álbumes homónimos de artistas distintos; disco antes
      // que pista porque en álbumes multi-disco los `track` se repiten por
      // disco y sin esa clave las canciones se entrelazan "al azar".
      arr.sort(
        (a, b) =>
          cmp(a.song.album, b.song.album) ||
          cmp(a.song.albumId, b.song.albumId) ||
          (a.song.discNumber ?? 0) - (b.song.discNumber ?? 0) ||
          (a.song.track ?? 0) - (b.song.track ?? 0) ||
          cmp(a.song.title, b.song.title),
      );
    if (dir === 'desc') arr.reverse();
    return arr;
  }, [source, field, dir]);

  const sortSheet = (
    <SortSheet
      fields={fields}
      labels={options?.labels}
      field={field}
      dir={dir}
      update={update}
      openRef={openRef}
    />
  );

  // Identidad estable para que el FlatList que los recibe no re-evalúe filas.
  const songs = useMemo(() => ordered.map((o) => o.song), [ordered]);
  const indices = useMemo(() => ordered.map((o) => o.idx), [ordered]);

  return {
    songs,
    indices,
    openSort: () => openRef.current(),
    sortSheet,
    sort: { field, dir },
    setSort: update,
  };
}

const styles = StyleSheet.create({
  sheetTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionText: { color: colors.text, fontSize: fontSize.md },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  dirRow: { flexDirection: 'row', gap: spacing.sm },
  dirChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHighlight,
  },
  dirChipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
});
