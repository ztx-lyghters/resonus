/** Favorites screen: starred songs, Spotify-style. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { getStarred, unstar } from '@/api/data';
import { type Song } from '@/api/subsonic';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Message } from '@/components/Message';
import { PlaylistPickerSheet } from '@/components/PlaylistPickerSheet';
import { TrackListView } from '@/components/TrackListView';
import { useDownloadMessage } from '@/hooks/useDownloadMessage';
import { useSongSort } from '@/hooks/useSongSort';
import { songsLabel, useT } from '@/i18n';
import { formatTotalDuration } from '@/lib/format';
import { useAuthStore } from '@/store/auth';
import { groupDownloadState, useDownloads } from '@/store/downloads';
import { currentSong, SOURCE_FAVORITES, usePlayerStore } from '@/store/player';
import { useSettings } from '@/store/settings';
import { showUndoToast, useToast } from '@/store/toast';
import { colors } from '@/theme';

// Indigo → black header (Spotify's "Liked Songs" style): Favorites art's
// indigo (#450af5, see FavoritesArt) darkened so white text is readable and the
// gradient blends cleanly with the background, same as the dark tones
// useDominantColor picks for albums and playlists.
const HEADER_COLOR = '#290693';

export default function FavoritesScreen() {
  useSettings((s) => s.accentColor); // re-render when accent changes
  const router = useRouter();
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const offline = useAuthStore((s) => s.offline);
  const t = useT();
  const lang = useSettings((s) => s.language);
  const showListArtwork = useSettings((s) => s.showListArtwork);
  const playing = usePlayerStore(currentSong);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const queryClient = useQueryClient();
  const toast = useToast((s) => s.show);

  const [confirmDownload, setConfirmDownload] = useState(false);
  const [confirmRemoveDl, setConfirmRemoveDl] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  // Songs selected in selection mode pending "add to another playlist".
  const [addingSongs, setAddingSongs] = useState<Song[] | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['starred'],
    queryFn: () => getStarred(),
    enabled: canFetch,
  });

  const songIds = (data?.songs ?? []).map((s) => s.id);
  const download = useDownloads(useShallow((s) => groupDownloadState(s, 'favorites', songIds)));
  const downloadFavorites = useDownloads((s) => s.downloadFavorites);
  const cancelDownload = useDownloads((s) => s.cancelDownload);
  const deleteSongs = useDownloads((s) => s.deleteSongs);
  const downloadSongs = useDownloads((s) => s.downloadSongs);
  // Stable between progress ticks (only changes with status): prevents the
  // Pressable from losing its touch when its onPress is recreated on every update.
  const onDownloadPress = useCallback(() => {
    if (download.status === 'none') setConfirmDownload(true);
    else if (download.status === 'done') setConfirmRemoveDl(true);
    else if (download.status === 'active') setConfirmStop(true);
  }, [download.status]);

  const { songs: displaySongs, openSort, sortSheet } = useSongSort(data?.songs ?? [], 'favorites');
  // Over `displaySongs`: this is what `downloadFavorites` downloads, and with a
  // filter applied it's not the same as `data.songs`.
  const downloadMsg = useDownloadMessage(displaySongs);

  /** Unstars several favorites with deferred delete and undo. */
  function removeMany(sel: Song[]) {
    if (sel.length === 0) return;
    const ids = new Set(sel.map((s) => s.id));
    // Optimistic on the central favorites list: they disappear immediately (also
    // the heart icons on rows, which read from ['starred']). The real unstar is
    // deferred until the toast expires; «Undo» cancels it.
    const prev = queryClient.getQueryData<{ songs: Song[] }>(['starred']);
    if (prev) {
      queryClient.setQueryData(['starred'], {
        ...prev,
        songs: prev.songs.filter((s) => !ids.has(s.id)),
      });
    }
    showUndoToast(
      sel.length === 1
        ? t('Removed from favorites')
        : t('{n} removed from favorites', { n: sel.length }),
      t('Undo'),
      {
        commit: () => {
          Promise.all(sel.map((s) => unstar(s.id)))
            .catch(() => useToast.getState().show(t("Couldn't complete the action")))
            .finally(() => queryClient.invalidateQueries({ queryKey: ['starred'] }));
        },
        undo: () => {
          if (prev) queryClient.setQueryData(['starred'], prev);
          else queryClient.invalidateQueries({ queryKey: ['starred'] });
        },
      },
    );
  }

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
        <Message text={t("Couldn't load favorites.")} onRetry={() => refetch()} />
      </View>
    );
  }

  if (displaySongs.length === 0 && offline) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="heart-outline"
          title={t('No favorites yet')}
          subtitle={t('Tap the heart on songs to see them here.')}
        />
      </View>
    );
  }

  const totalSec = displaySongs.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  const metaParts = [songsLabel(displaySongs.length, lang)];
  if (totalSec > 0) metaParts.push(formatTotalDuration(totalSec));

  return (
    <>
      <TrackListView
        title={t('Favorites')}
        meta={metaParts.join(' · ')}
        hideCover
        accentColor={HEADER_COLOR}
        songs={displaySongs}
        currentId={playing?.id}
        showArtwork={showListArtwork}
        searchable
        searchPlaceholder={t('Find in favorites')}
        onSort={displaySongs.length > 1 ? openSort : undefined}
        addAction={{ label: t('Add to favorites'), onPress: () => router.push('/favorites-add') }}
        download={
          !offline && displaySongs.length > 0
            ? { ...download, onPress: onDownloadPress }
            : undefined
        }
        selection={{
          onRemove: (sel) => removeMany(sel),
          onAddTo: (sel) => setAddingSongs(sel),
          onDownload: !offline
            ? (sel) => {
                void downloadSongs(sel);
                toast(t('Downloading…'));
              }
            : undefined,
        }}
        onPlay={(start) => playQueue(displaySongs, start, SOURCE_FAVORITES, '/favorites')}
      />
      <PlaylistPickerSheet songs={addingSongs} onClose={() => setAddingSongs(null)} />
      {sortSheet}

      <Dialog
        visible={confirmDownload}
        title={t('Download “{name}”?', { name: t('Favorites') })}
        message={downloadMsg.message}
        confirmLabel={t('Download')}
        onCancel={() => setConfirmDownload(false)}
        onConfirm={() => {
          setConfirmDownload(false);
          void downloadFavorites(displaySongs);
        }}
      />

      <Dialog
        visible={confirmRemoveDl}
        title={t('Remove download?')}
        message={t('“{name}” will no longer be available offline.', { name: t('Favorites') })}
        confirmLabel={t('Remove')}
        destructive
        onCancel={() => setConfirmRemoveDl(false)}
        onConfirm={() => {
          setConfirmRemoveDl(false);
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
          cancelDownload('favorites');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
});
