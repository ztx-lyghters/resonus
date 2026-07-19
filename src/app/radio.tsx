/** Emisoras de radio del servidor (exploración desde Inicio). */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createRadioStation,
  deleteRadioStation,
  getRadioStations,
  updateRadioStation,
  type RadioStation,
} from '@/api/backend';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Message } from '@/components/Message';
import { RadioEditSheet, type RadioEdit } from '@/components/RadioEditSheet';
import { useT } from '@/i18n';
import { queryClient } from '@/lib/query';
import { useAuthStore } from '@/store/auth';
import { currentSong, usePlayerStore } from '@/store/player';
import { useToast } from '@/store/toast';
import { colors, fontSize, radius, spacing, SCREEN_BOTTOM_PADDING } from '@/theme';

const EMPTY_EDIT: RadioEdit = { name: '', streamUrl: '', homePageUrl: '' };

export default function RadioScreen() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore((s) => s.auth);
  const offline = useAuthStore((s) => s.offline);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const playingId = usePlayerStore((s) => currentSong(s)?.id);
  const toast = useToast((s) => s.show);

  // Jellyfin no gestiona emisoras; el modo offline no llega al servidor.
  const canManage = !!auth && auth.serverType !== 'jellyfin' && !offline;

  // `editForm` guarda el formulario abierto (nuevo o edición); `menu` la fila
  // con el menú de acciones abierto; `deleting` la que espera confirmación.
  const [editForm, setEditForm] = useState<{ station: RadioStation | null } | null>(null);
  const [menu, setMenu] = useState<RadioStation | null>(null);
  const [deleting, setDeleting] = useState<RadioStation | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['radioStations'],
    queryFn: () => getRadioStations(auth!),
    enabled: !!auth,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['radioStations'] });

  async function saveStation(changes: RadioEdit) {
    const station = editForm?.station ?? null;
    setEditForm(null);
    try {
      if (station) {
        await updateRadioStation(
          auth!,
          station.id,
          changes.name,
          changes.streamUrl,
          changes.homePageUrl,
        );
      } else {
        await createRadioStation(auth!, changes.name, changes.streamUrl, changes.homePageUrl);
      }
      await refresh();
    } catch {
      toast(t("Couldn't complete the action"));
    }
  }

  async function confirmDelete() {
    const station = deleting;
    setDeleting(null);
    if (!station) return;
    try {
      await deleteRadioStation(auth!, station.id);
      await refresh();
    } catch {
      toast(t("Couldn't complete the action"));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel={t('Back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('Radio')}</Text>
        {canManage ? (
          <Pressable
            hitSlop={10}
            onPress={() => setEditForm({ station: null })}
            accessibilityLabel={t('Add station')}
          >
            <Ionicons name="add" size={28} color={colors.text} />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      ) : isError ? (
        <Message text={t("Couldn't load radio stations.")} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
          }
          renderItem={({ item }: { item: RadioStation }) => {
            const playing = playingId === item.id;
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  playQueue(
                    [{ id: item.id, title: item.name, url: item.streamUrl, artist: t('Radio') }],
                    0,
                    item.name,
                    '/radio',
                  )
                }
                onLongPress={canManage ? () => setMenu(item) : undefined}
              >
                <View style={styles.radioIcon}>
                  <Ionicons name="radio" size={22} color={colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.rowTitle, playing && { color: colors.accent }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.homePageUrl ? (
                    <Text style={styles.rowSub} numberOfLines={1}>{item.homePageUrl}</Text>
                  ) : null}
                </View>
                {canManage ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => setMenu(item)}
                    accessibilityLabel={t('More')}
                  >
                    <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
                  </Pressable>
                ) : (
                  <Ionicons name="play-circle" size={28} color={colors.accent} />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="radio-outline"
              title={t('No radio stations')}
              subtitle={
                canManage
                  ? t('Tap + to add an internet radio station.')
                  : t("Add internet radio stations on your server and they'll show up here.")
              }
            />
          }
        />
      )}

      <RadioEditSheet
        visible={!!editForm}
        editing={!!editForm?.station}
        initial={
          editForm?.station
            ? {
                name: editForm.station.name,
                streamUrl: editForm.station.streamUrl,
                homePageUrl: editForm.station.homePageUrl ?? '',
              }
            : EMPTY_EDIT
        }
        onCancel={() => setEditForm(null)}
        onSave={(changes) => void saveStation(changes)}
      />

      <Modal
        transparent
        visible={!!menu}
        animationType="fade"
        onRequestClose={() => setMenu(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{menu?.name}</Text>
          <Pressable
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
            onPress={() => {
              const station = menu;
              setMenu(null);
              setEditForm({ station });
            }}
          >
            <Ionicons name="create-outline" size={24} color={colors.text} />
            <Text style={styles.actionText}>{t('Edit station')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
            onPress={() => {
              const station = menu;
              setMenu(null);
              setDeleting(station);
            }}
          >
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>{t('Delete station')}</Text>
          </Pressable>
        </View>
      </Modal>

      <Dialog
        visible={!!deleting}
        title={t('Delete station')}
        message={t('Remove “{name}” from your server?', { name: deleting?.name ?? '' })}
        confirmLabel={t('Delete')}
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
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
  list: { paddingHorizontal: spacing.lg, paddingBottom: SCREEN_BOTTOM_PADDING, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  radioIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowSub: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: fontSize.md,
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
});
