/** Detalle de un álbum con sus canciones. */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { coverArtUrl, getAlbum } from '@/api/data';
import { type Song } from '@/api/subsonic';
import { CoverViewer } from '@/components/CoverViewer';
import { Dialog } from '@/components/Dialog';
import { Message } from '@/components/Message';
import { MoreFromArtist } from '@/components/MoreFromArtist';
import { PlaylistPickerSheet } from '@/components/PlaylistPickerSheet';
import { TrackListSkeleton } from '@/components/TrackListSkeleton';
import { TrackListView } from '@/components/TrackListView';
import { useDownloadMessage } from '@/hooks/useDownloadMessage';
import { useFavoriteIds } from '@/hooks/useFavoriteIds';
import { songsLabel, useT } from '@/i18n';
import { formatTotalDuration } from '@/lib/format';
import { useAuthStore } from '@/store/auth';
import { groupDownloadState, useDownloads } from '@/store/downloads';
import { useMediaMenu } from '@/store/mediaMenu';
import { currentSong, usePlayerStore } from '@/store/player';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { colors, fontSize, spacing } from '@/theme';

/**
 * Cabeceras de disco por índice de canción (álbumes multi-disco). Etiqueta cada
 * disco con su título (`discTitles`) o "Disc N" de fallback, en la primera pista
 * de cada disco. Solo si hay 2+ discos, o uno solo con título explícito (imita a
 * Navidrome).
 *
 * `discNumber` es opcional en Subsonic y muchos álbumes no lo traen (los números
 * de pista reinician por el tag `track`, no por `discnumber`). Por eso: si
 * `discNumber` distingue discos, se usa; si no, se infieren los cortes por el
 * reinicio del número de pista (una pista con `track` menor que la anterior
 * abre disco nuevo). Los discos inferidos se numeran 1, 2, 3… que suele coincidir
 * con `discTitles` si el álbum los trae.
 */
function discHeadersFor(
  songs: Song[],
  discTitles: { disc: number; title: string }[] | undefined,
  enabled: boolean,
  fallbackLabel: (disc: number) => string,
): Record<number, string> | undefined {
  if (!enabled || songs.length === 0) return undefined;
  // Navidrome manda `discTitles` con `title: ""` cuando el disco no tiene
  // subtítulo real; tratamos el vacío como ausente para caer en "Disc N".
  const titleOf = (disc: number) => {
    const title = discTitles?.find((d) => d.disc === disc)?.title?.trim();
    return title ? title : undefined;
  };

  const firstIndex = new Map<number, number>();
  const variedDisc = new Set(songs.map((s) => s.discNumber ?? 1)).size >= 2;
  if (variedDisc) {
    songs.forEach((s, i) => {
      const disc = s.discNumber ?? 1;
      if (!firstIndex.has(disc)) firstIndex.set(disc, i);
    });
  } else {
    // Sin discNumber útil: cada reinicio del número de pista abre un disco.
    let disc = 1;
    let prevTrack = -Infinity;
    songs.forEach((s, i) => {
      const track = s.track;
      if (i > 0 && track != null && track > 0 && track < prevTrack) disc += 1;
      if (!firstIndex.has(disc)) firstIndex.set(disc, i);
      if (track != null && track > 0) prevTrack = track;
    });
  }

  const discs = [...firstIndex.keys()];
  const singleTitled = discs.length === 1 && titleOf(discs[0]) != null;
  if (discs.length < 2 && !singleTitled) return undefined;
  const headers: Record<number, string> = {};
  for (const disc of discs) headers[firstIndex.get(disc)!] = titleOf(disc) ?? fallbackLabel(disc);
  return headers;
}

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const offline = useAuthStore((s) => s.offline);
  const t = useT();
  const lang = useSettings((s) => s.language);
  const showArtistPhoto = useSettings((s) => s.showArtistPhoto);
  const showDiscHeaders = useSettings((s) => s.showDiscHeaders);
  const playing = usePlayerStore(currentSong);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const openMediaMenu = useMediaMenu((s) => s.open);
  const toast = useToast((s) => s.show);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  // Canciones marcadas en el modo selección pendientes de "añadir a playlist".
  const [addingSongs, setAddingSongs] = useState<Song[] | null>(null);
  // El corazón lee de la lista central de favoritos (se refresca al marcar);
  // `data.album.starred` del detalle se queda obsoleto tras marcar/desmarcar.
  const favAlbumIds = useFavoriteIds(canFetch, 'album');

  const { data: fresh, isLoading, isError, refetch } = useQuery({
    queryKey: ['album', id],
    queryFn: () => getAlbum(id),
    enabled: canFetch && !!id,
  });

  // El álbum ha dejado de existir mientras lo mirabas: en modo local los álbumes
  // se derivan de sus canciones, así que quitar la última descarga borra el
  // álbum entero. Sin esto la pantalla se quedaba con una cabecera inventada, 0
  // canciones y un botón de play que no reproducía nada. Salir es lo que ya hace
  // la pantalla de playlist cuando la borras desde dentro, y aquí tampoco se
  // siente aleatorio: acabas de destruirlo tú.
  // Solo en local: con servidor, quitar una descarga no borra nada.
  const vanished = offline && !!fresh && fresh.songs.length === 0;
  useEffect(() => {
    if (vanished && router.canGoBack()) router.back();
  }, [vanished, router]);

  // Mientras se va, seguimos pintando lo último bueno. `router.back()` no es
  // instantáneo (anima ~300 ms) y el efecto corre después de pintar, así que la
  // pantalla sigue montada un rato con el álbum ya borrado: sin esto asomaba el
  // "Álbum desconocido" y 0 canciones antes de irse. Congelándolo, la pantalla
  // simplemente se desliza fuera tal y como estaba.
  const lastGood = useRef(fresh);
  if (fresh && fresh.songs.length > 0) lastGood.current = fresh;
  const data = vanished ? (lastGood.current ?? fresh) : fresh;

  const discHeaders = useMemo(
    () =>
      discHeadersFor(data?.songs ?? [], data?.album.discTitles, showDiscHeaders, (n) =>
        t('Disc {n}', { n }),
      ),
    [data?.songs, data?.album.discTitles, showDiscHeaders, t],
  );

  const songIds = data?.songs.map((s) => s.id) ?? [];
  const downloadMsg = useDownloadMessage(data?.songs ?? []);
  const download = useDownloads(useShallow((s) => groupDownloadState(s, `album:${id}`, songIds)));
  const downloadAlbum = useDownloads((s) => s.downloadAlbum);
  const cancelDownload = useDownloads((s) => s.cancelDownload);
  const deleteSongs = useDownloads((s) => s.deleteSongs);
  const downloadSongs = useDownloads((s) => s.downloadSongs);
  // Estable entre ticks de progreso (solo cambia con el estado): si su identidad
  // cambiara en cada actualización del %, el Pressable perdería el toque y habría
  // que pulsar varias veces.
  const onDownloadPress = useCallback(() => {
    if (download.status === 'none') setConfirmDownload(true);
    else if (download.status === 'done') setConfirmDelete(true);
    else if (download.status === 'active') setConfirmStop(true);
  }, [download.status]);

  if (isLoading) {
    return <TrackListSkeleton />;
  }

  if (isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <Message text={t("Couldn't load the album.")} onRetry={() => refetch()} />
      </View>
    );
  }

  const labels = (data.album.recordLabels ?? []).map((l) => l.name).filter(Boolean);
  const labelText = labels.length
    ? `℗ ${data.album.year ? `${data.album.year} ` : ''}${labels.join(' · ')}`
    : null;

  const totalSec = data.songs.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  const metaParts = [t('Album')];
  if (data.album.year) metaParts.push(String(data.album.year));
  metaParts.push(songsLabel(data.songs.length, lang));
  if (totalSec > 0) metaParts.push(formatTotalDuration(totalSec));

  return (
    <>
      <TrackListView
        title={data.album.name}
        subtitle={data.album.artist}
        artistId={data.album.artistId}
        artists={data.album.artists}
        artistImageUri={
          showArtistPhoto && data.album.artistId
            ? coverArtUrl(data.album.artistId, 100)
            : undefined
        }
        meta={metaParts.join(' · ')}
        coverUri={coverArtUrl(data.album.coverArt ?? data.album.id, 500)}
        onCoverPress={() => setCoverOpen(true)}
        // Misma hoja que el long-press en tarjetas: reproducir, a la cola,
        // descargar, favorito y fijar, sin duplicar menú.
        onMenu={() => openMediaMenu({ kind: 'album', album: data.album })}
        songs={data.songs}
        currentId={playing?.id}
        numbered
        discHeaders={discHeaders}
        favorite={{
          id: data.album.id,
          type: 'album',
          starred: favAlbumIds ? favAlbumIds.has(data.album.id) : !!data.album.starred,
        }}
        download={!offline ? { ...download, onPress: onDownloadPress } : undefined}
        footer={
          data.album.artistId || labelText ? (
            <>
              {data.album.artistId ? (
                <MoreFromArtist
                  artistId={data.album.artistId}
                  artistName={data.album.artist ?? ''}
                  currentAlbumId={data.album.id}
                />
              ) : null}
              {labelText ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: fontSize.xs,
                    marginTop: spacing.lg,
                  }}
                >
                  {labelText}
                </Text>
              ) : null}
            </>
          ) : undefined
        }
        // Sin "Quitar": las canciones de un álbum no se pueden sacar de él.
        selection={{
          onAddTo: (sel) => setAddingSongs(sel),
          onDownload: !offline
            ? (sel) => {
                void downloadSongs(sel);
                toast(t('Downloading…'));
              }
            : undefined,
        }}
        onPlay={(start) => playQueue(data.songs, start, data.album.name, `/album/${id}`)}
      />
      <PlaylistPickerSheet songs={addingSongs} onClose={() => setAddingSongs(null)} />
      <CoverViewer
        visible={coverOpen}
        uri={coverArtUrl(data.album.coverArt ?? data.album.id, 1200)}
        onClose={() => setCoverOpen(false)}
      />
      <Dialog
        visible={confirmDownload}
        title={t('Download “{name}”?', { name: data.album.name })}
        message={downloadMsg.message}
        confirmLabel={t('Download')}
        onCancel={() => setConfirmDownload(false)}
        onConfirm={() => {
          setConfirmDownload(false);
          void downloadAlbum(data.album, data.songs);
        }}
      />
      <Dialog
        visible={confirmDelete}
        title={t('Remove download?')}
        message={t('“{name}” will no longer be available offline.', { name: data.album.name })}
        confirmLabel={t('Remove')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteSongs(songIds);
        }}
      />
      <Dialog
        visible={confirmStop}
        title={t('Stop download?')}
        message={t('Songs already downloaded will be kept.')}
        confirmLabel={t('Stop')}
        destructive
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          cancelDownload(`album:${id}`);
        }}
      />
    </>
  );
}
