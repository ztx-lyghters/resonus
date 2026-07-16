/**
 * Aleatorio: canciones al azar, de toda la biblioteca o de un género
 * (`?genre=`). Es un destino y no un botón a propósito: así hereda de
 * TrackListView el play, el aleatorio, la búsqueda y la selección múltiple, y
 * además ves lo que va a sonar en vez de lanzar cientos de canciones a ciegas.
 *
 * Azar puro, sin criterio: no confundir con el mix de una canción, que busca
 * parecidas a una semilla (menú ⋯ de la canción).
 */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getRandomSongs } from '@/api/data';
import { type Song } from '@/api/subsonic';
import { EmptyState } from '@/components/EmptyState';
import { Message } from '@/components/Message';
import { PlaylistPickerSheet } from '@/components/PlaylistPickerSheet';
import { TrackListView } from '@/components/TrackListView';
import { songsLabel, useT } from '@/i18n';
import { formatTotalDuration } from '@/lib/format';
import { useAuthStore } from '@/store/auth';
import { useDownloads } from '@/store/downloads';
import { currentSong, usePlayerStore } from '@/store/player';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { colors } from '@/theme';

/** Cabecera verde azulado → negro: no hay carátula de la que sacar color. */
const HEADER_COLOR = '#0b6e5f';

/** No es la biblioteca entera: el endpoint topa ~500 y una cola así no se usa. */
const SHUFFLE_SIZE = 200;

export default function ShuffleScreen() {
  useSettings((s) => s.accentColor); // re-render al cambiar el acento
  // Sin género = toda la biblioteca. Los géneros son cosa del servidor, así que
  // este parámetro nunca llega en local.
  const { genre } = useLocalSearchParams<{ genre?: string }>();
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const offline = useAuthStore((s) => s.offline);
  const t = useT();
  const lang = useSettings((s) => s.language);
  const showListArtwork = useSettings((s) => s.showListArtwork);
  const playing = usePlayerStore(currentSong);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const downloadSongs = useDownloads((s) => s.downloadSongs);
  const toast = useToast((s) => s.show);
  // Canciones marcadas en el modo selección pendientes de "añadir a otra".
  const [addingSongs, setAddingSongs] = useState<Song[] | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    // El género entra en la clave: cada uno tiene su propia mezcla en caché.
    queryKey: ['randomSongs', genre ?? ''],
    queryFn: () => getRandomSongs(SHUFFLE_SIZE, genre),
    enabled: canFetch,
    // No caduca sola: se rebaraja con "Volver a barajar" y punto. Si caducara,
    // volver atrás desde el reproductor te cambiaría la lista debajo.
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Message text={t("Couldn't load songs.")} onRetry={() => refetch()} />
      </View>
    );
  }

  const totalSec = data.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  // Con género manda el género en el título, y "Aleatorio" pasa al subtítulo:
  // así se distingue de la pantalla de álbumes de ese mismo género.
  const metaParts = genre ? [t('Shuffle')] : [];
  metaParts.push(songsLabel(data.length, lang));
  if (totalSec > 0) metaParts.push(formatTotalDuration(totalSec));
  const source = genre || t('Shuffle');

  return (
    <>
      <TrackListView
        title={source}
        meta={metaParts.join(' · ')}
        hideCover
        accentColor={HEADER_COLOR}
        songs={data}
        currentId={playing?.id}
        showArtwork={showListArtwork}
        searchable
        // Sin ordenar a propósito: ordenar una lista al azar la deshace.
        addAction={{
          label: isFetching ? t('Shuffling…') : t('Shuffle again'),
          icon: 'shuffle',
          onPress: () => void refetch(),
        }}
        emptyState={
          <EmptyState
            icon="shuffle"
            title={t('Nothing to shuffle yet')}
            subtitle={t('Add music to your library to hear it here.')}
          />
        }
        selection={{
          onAddTo: (sel) => setAddingSongs(sel),
          onDownload: !offline
            ? (sel) => {
                void downloadSongs(sel);
                toast(t('Downloading…'));
              }
            : undefined,
        }}
        onPlay={(start) =>
          playQueue(data, start, source, genre ? undefined : '/shuffle')
        }
      />
      <PlaylistPickerSheet songs={addingSongs} onClose={() => setAddingSongs(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
});
