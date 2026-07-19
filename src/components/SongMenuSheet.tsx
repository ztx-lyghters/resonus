/** Hoja inferior con acciones para una canción (menú ⋯). */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomSheetAnim } from '@/hooks/useBottomSheetAnim';
import {
  addToPlaylist,
  coverArtUrl,
  createPlaylist,
  getPlaylist,
  getPlaylists,
  removeFromPlaylist,
  star,
  unstar,
} from '@/api/data';
import { useFavoriteIds } from '@/hooks/useFavoriteIds';
import { artistTargets } from '@/lib/artistNav';
import { normKey } from '@/lib/localLibrary';
import { useArtistPicker } from '@/store/artistPicker';
import { useAuthStore } from '@/store/auth';
import { useDownloads } from '@/store/downloads';
import { usePlayerStore } from '@/store/player';
import { useSettings } from '@/store/settings';
import { useSongMenu } from '@/store/songMenu';
import { showUndoToast, useToast } from '@/store/toast';
import { useT } from '@/i18n';
import { colors, fontSize, radius, spacing } from '@/theme';
import { Cover } from './Cover';
import { Dialog } from './Dialog';
import { StarRating } from './StarRating';

/** Alto máximo de la lista de playlists: proporcional a la pantalla para que
 *  no quede compacta en móviles grandes (antes era un fijo de 360). */
const PLAYLISTS_MAX_H = Math.round(Dimensions.get('window').height * 0.6);

/**
 * Minutos que faltan para el vencimiento, mínimo 1.
 *
 * Hacia abajo, como cualquier cuenta atrás: con 14:50 por delante se marca 14,
 * igual que un reloj. Redondeando hacia arriba daría 15 hasta que quedaran
 * exactamente 14:00, así que el primer minuto entero repetiría el número que
 * se eligió — justo lo que esta etiqueta viene a evitar.
 *
 * El mínimo de 1 es para el último minuto: "0 min" leería como que ya no hay
 * temporizador, y todavía queda.
 */
function minutesLeft(endsAt: number): number {
  return Math.max(1, Math.floor((endsAt - Date.now()) / 60_000));
}


function Action({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={24} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

export function SongMenuSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuthStore((s) => s.auth);
  const offline = useAuthStore((s) => s.offline);
  const queryClient = useQueryClient();
  const song = useSongMenu((s) => s.song);
  const context = useSongMenu((s) => s.context);
  const showLyrics = useSongMenu((s) => s.showLyrics);
  const closeNow = useSongMenu((s) => s.close);
  const { dismiss, backdropStyle, sheetStyle, onSheetLayout } = useBottomSheetAnim(!!song);
  // Cierre animado: la hoja baja y después se desmonta el Modal. Todas las
  // acciones cierran por aquí.
  const close = () => dismiss(closeNow);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNext = usePlayerStore((s) => s.playNext);
  const startRadio = usePlayerStore((s) => s.startRadio);
  // Acciones visibles (Ajustes → Aspecto → Menú de canción). Se suma a las
  // condiciones de cada una: esconderla no reactiva lo que ya no aplicaba.
  const menu = useSettings((s) => s.songMenuActions);
  const serverType = useAuthStore((s) => s.auth?.serverType);
  const rateSong = usePlayerStore((s) => s.rateSong);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const setSleepAtSongEnd = usePlayerStore((s) => s.setSleepAtSongEnd);
  const cancelSleepTimer = usePlayerStore((s) => s.cancelSleepTimer);
  const sleepEndsAt = usePlayerStore((s) => s.sleepEndsAt);
  const sleepAtSongEnd = usePlayerStore((s) => s.sleepAtSongEnd);
  const toast = useToast((s) => s.show);
  const t = useT();
  const downloaded = useDownloads((s) => !!(song && s.files[song.id]));
  const downloadSong = useDownloads((s) => s.downloadSong);
  const deleteDownloads = useDownloads((s) => s.deleteSongs);
  const openArtistPicker = useArtistPicker((s) => s.open);
  const favIds = useFavoriteIds(!!song);
  const favorited = song ? (favIds ? favIds.has(song.id) : !!song.starred) : false;

  const [mode, setMode] = useState<'actions' | 'playlists' | 'sleep' | 'rating'>('actions');
  const [creating, setCreating] = useState(false);
  // Aviso "ya está en la playlist" pendiente de confirmar (estilo Spotify).
  const [dupPrompt, setDupPrompt] = useState<{ playlistId: string; name: string } | null>(null);

  // Al abrir el menú para una canción, volvemos siempre a la vista de acciones.
  useEffect(() => {
    if (song) setMode('actions');
  }, [song]);

  const { data: playlists, isLoading: loadingPlaylists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => getPlaylists(),
    enabled: (!!auth || offline) && mode === 'playlists',
  });

  if (!song) return null;

  const go = (path: string) => {
    close();
    router.push(path);
  };

  /** Añade de verdad (sin comprobar duplicados) y cierra con toast. */
  async function doAdd(playlistId: string, playlistName: string) {
    if (!song) return;
    close();
    try {
      await addToPlaylist(playlistId, song.id);
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      toast(t('Added to “{name}”', { name: playlistName }));
    } catch {
      toast(t("Couldn't add to the playlist"));
    }
  }

  async function addTo(playlistId: string, playlistName: string) {
    if ((!auth && !offline) || !song) return;
    // Aviso de duplicado estilo Spotify: si ya está, preguntar antes. Si la
    // comprobación falla (red), se añade sin aviso: mejor que bloquear.
    try {
      const { songs } = await getPlaylist(playlistId);
      if (songs.some((s) => s.id === song.id)) {
        setDupPrompt({ playlistId, name: playlistName });
        return;
      }
    } catch {
      // ignore
    }
    await doAdd(playlistId, playlistName);
  }

  async function createAndAdd(name: string) {
    setCreating(false);
    if ((!auth && !offline) || !song || !name.trim()) return;
    close();
    try {
      const id = await createPlaylist(name.trim());
      await addToPlaylist(id, song.id);
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast(t('Added to “{name}”', { name: name.trim() }));
    } catch {
      toast(t("Couldn't create the playlist"));
    }
  }

  function removeFromList() {
    if ((!auth && !offline) || !context) return;
    close();
    const { playlistId, index } = context;
    const key = ['playlist', playlistId];
    // Optimista: la canción desaparece ya de la lista; el borrado real se
    // difiere hasta que el toast caduca. «Deshacer» lo cancela y la restaura
    // en su posición (el servidor no llegó a enterarse).
    const prev = queryClient.getQueryData<{ playlist: unknown; songs: unknown[] }>(key);
    if (prev) {
      queryClient.setQueryData(key, { ...prev, songs: prev.songs.filter((_, i) => i !== index) });
    }
    showUndoToast(t('Removed from playlist'), t('Undo'), {
      commit: () => {
        removeFromPlaylist(playlistId, index)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: key });
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
          })
          .catch(() => {
            useToast.getState().show(t("Couldn't complete the action"));
            queryClient.invalidateQueries({ queryKey: key });
          });
      },
      undo: () => {
        if (prev) queryClient.setQueryData(key, prev);
        else queryClient.invalidateQueries({ queryKey: key });
      },
    });
  }

  return (
    <Modal transparent animationType="none" visible onRequestClose={close}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }, sheetStyle]}
        onLayout={onSheetLayout}
      >
        <View style={styles.headerRow}>
          <Cover uri={coverArtUrl( song.coverArt ?? song.albumId, 100)} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {song.title}
            </Text>
            {song.artist ? (
              <Text style={styles.artist} numberOfLines={1}>
                {song.artist}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.divider} />

        {mode === 'playlists' ? (
          <View style={{ maxHeight: PLAYLISTS_MAX_H }}>
            <Pressable
              style={styles.action}
              onPress={() => setMode('actions')}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
              <Text style={styles.actionText}>{t('Add to a playlist')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              onPress={() => setCreating(true)}
            >
              <View style={styles.newPlaylistIcon}>
                <Ionicons name="add" size={24} color={colors.text} />
              </View>
              <Text style={styles.actionText}>{t('New playlist')}</Text>
            </Pressable>
            {loadingPlaylists ? (
              <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.accent} />
            ) : (
              <ScrollView>
                {(playlists ?? []).map((p) => (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                    onPress={() => addTo(p.id, p.name)}
                  >
                    <Cover uri={coverArtUrl( p.coverArt ?? p.id, 100)} size={40} />
                    <Text style={styles.actionText} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : mode === 'sleep' ? (
          <View>
            <Pressable style={styles.action} onPress={() => setMode('actions')}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
              <Text style={styles.actionText}>{t('Sleep timer')}</Text>
            </Pressable>
            {[15, 30, 45, 60].map((m) => (
              <Pressable
                key={m}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  setSleepTimer(m);
                  toast(t('Will pause in {n} min', { n: m }));
                  close();
                }}
              >
                <Ionicons name="time-outline" size={24} color={colors.text} />
                <Text style={styles.actionText}>{t('{n} minutes', { n: m })}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              onPress={() => {
                setSleepAtSongEnd();
                toast(t('Will pause when the song ends'));
                close();
              }}
            >
              <Ionicons name="musical-note-outline" size={24} color={colors.text} />
              <Text style={styles.actionText}>{t('When the song ends')}</Text>
            </Pressable>
            {sleepEndsAt || sleepAtSongEnd ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  cancelSleepTimer();
                  toast(t('Sleep timer off'));
                  close();
                }}
              >
                <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
                <Text style={[styles.actionText, { color: colors.danger }]}>
                  {t('Turn off')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : mode === 'rating' ? (
          <View>
            <Pressable style={styles.action} onPress={() => setMode('actions')}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
              <Text style={styles.actionText}>{t('Rate')}</Text>
            </Pressable>
            <View style={styles.ratingRow}>
              <StarRating
                id={song.id}
                rating={song.userRating}
                size={34}
                onRated={(r) => rateSong(song.id, r)}
              />
            </View>
          </View>
        ) : (
          <>
            {menu.playlist ? (
              <Action
                icon="add-circle-outline"
                label={t('Add to a playlist')}
                onPress={() => setMode('playlists')}
              />
            ) : null}
            {context ? (
              <Action
                icon="remove-circle-outline"
                label={t('Remove from playlist')}
                onPress={removeFromList}
              />
            ) : null}
            {menu.artist && (song.artistId || song.artist) ? (
              <Action
                icon="person"
                label={t('Go to artist')}
                onPress={() => {
                  const targets = artistTargets(song);
                  if (targets.length > 1) {
                    // Cerramos la hoja y, tras su animación de salida, abrimos el
                    // selector (evita dos Modals visibles a la vez).
                    dismiss(() => {
                      closeNow();
                      openArtistPicker(targets);
                    });
                    return;
                  }
                  const id = targets[0]?.id ?? (song.artist ? normKey(song.artist) : '');
                  if (id) go(`/artist/${id}`);
                }}
              />
            ) : null}
            {menu.album && (song.albumId || song.album) ? (
              <Action
                icon="disc"
                label={t('Go to album')}
                onPress={() => {
                  if (song.albumId) { go(`/album/${song.albumId}`); return; }
                  if (song.album) {
                    const key = normKey(song.album) + '|' + normKey(song.artist || '');
                    go(`/album/${key}`);
                  }
                }}
              />
            ) : null}
            {menu.lyrics && showLyrics ? (
              <Action
                icon="mic-outline"
                label={t('Lyrics')}
                onPress={() => go('/lyrics')}
              />
            ) : null}
            {/* Con las de reproducción, no con las de organizar: esto cambia la
                cola y se pone a sonar. Solo online (las parecidas las busca el
                servidor) y no en emisoras (`url`), que no tienen "parecidas". */}
            {menu.mix && !offline && !song.url ? (
              <Action
                icon="sparkles-outline"
                label={t('Start mix')}
                onPress={() => {
                  close();
                  void startRadio(song, t('Mix of “{name}”', { name: song.title }));
                }}
              />
            ) : null}
            {menu.playNext ? (
              <Action
                icon="play-forward"
                label={t('Play next')}
                onPress={() => {
                  playNext(song);
                  toast(t('Playing next'));
                  close();
                }}
              />
            ) : null}
            {menu.queue ? (
              <Action
                icon="list"
                label={t('Add to queue')}
                onPress={() => {
                  addToQueue(song);
                  toast(t('Added to queue'));
                  close();
                }}
              />
            ) : null}
            {menu.favorite ? (
              <Action
                icon={favorited ? 'heart' : 'heart-outline'}
                label={favorited ? t('Remove from favorites') : t('Add to favorites')}
                onPress={() => {
                  (favorited ? unstar(song.id) : star(song.id)).then(() =>
                    queryClient.invalidateQueries({ queryKey: ['starred'] }),
                  );
                  toast(favorited ? t('Removed from favorites') : t('Added to favorites'));
                  close();
                }}
              />
            ) : null}
            {/* Valorar (setRating de Subsonic): solo online, servidor no-Jellyfin
                y no en local/descargadas/radio, donde no aplica. */}
            {menu.rating && !offline && serverType !== 'jellyfin' && !song.localUri && !song.url ? (
              <Action icon="star-outline" label={t('Rate')} onPress={() => setMode('rating')} />
            ) : null}
            {menu.download && downloaded ? (
              <Action
                icon="arrow-down-circle"
                label={t('Remove download')}
                onPress={() => {
                  // El fichero se borra ya; «Deshacer» vuelve a descargarlo
                  // (sin conexión no se ofrece: no habría de dónde bajarlo).
                  void deleteDownloads([song.id]);
                  toast(
                    t('Download removed'),
                    offline ? undefined : { label: t('Undo'), run: () => void downloadSong(song) },
                  );
                  close();
                }}
              />
            ) : menu.download && !offline && !song.url ? (
              <Action
                icon="download-outline"
                label={t('Download')}
                onPress={() => {
                  void downloadSong(song);
                  toast(t('Downloading…'));
                  close();
                }}
              />
            ) : null}
            {menu.sleepTimer ? (
              <Action
                icon="moon-outline"
                label={
                  sleepEndsAt
                    ? t('Sleep timer ({n} min left)', { n: minutesLeft(sleepEndsAt) })
                    : sleepAtSongEnd
                      ? t('Sleep timer (end of song)')
                      : t('Sleep timer')
                }
                onPress={() => setMode('sleep')}
              />
            ) : null}
          </>
        )}
      </Animated.View>

      <Dialog
        visible={creating}
        title={t('New playlist')}
        input={{ placeholder: t('Playlist name') }}
        confirmLabel={t('Create')}
        onCancel={() => setCreating(false)}
        onConfirm={createAndAdd}
      />

      <Dialog
        visible={!!dupPrompt}
        title={t('Already added')}
        message={dupPrompt ? t('This song is already in “{name}”.', { name: dupPrompt.name }) : undefined}
        confirmLabel={t('Add anyway')}
        onCancel={() => setDupPrompt(null)}
        onConfirm={() => {
          const d = dupPrompt;
          setDupPrompt(null);
          if (d) void doAdd(d.playlistId, d.name);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  artist: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.sm },
  ratingRow: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionText: { color: colors.text, fontSize: fontSize.md },
  newPlaylistIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
