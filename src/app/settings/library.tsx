/** Ajustes › Biblioteca: escaneo, bibliotecas del servidor y limpieza de caché. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rescanLocal } from '@/api/data';
import { getScanStatus, startScan } from '@/api/backend';
import { Field, SettingRow, SettingsPage, SwitchList, settingsStyles } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { ensureAudioPermission, pickFolder } from '@/lib/localLibrary';
import { queryClient } from '@/lib/query';
import { useAuthStore } from '@/store/auth';
import { profileKeyOf, useLibraries } from '@/store/libraries';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { colors, fontSize, radius, spacing } from '@/theme';

export default function LibrarySettings() {
  useSettings((s) => s.accentColor); // re-render al cambiar el acento
  const t = useT();
  const auth = useAuthStore((s) => s.auth);
  const offline = useAuthStore((s) => s.offline);
  const source = useAuthStore((s) => s.offlineSource);
  const setSource = useAuthStore((s) => s.setOfflineSource);
  const toast = useToast((s) => s.show);
  const insets = useSafeAreaInsets();
  // Bibliotecas del servidor (Navidrome multi-library): un switch por carpeta.
  const foldersMap = useLibraries((s) => s.folders);
  const disabledMap = useLibraries((s) => s.disabled);
  const setEnabled = useLibraries((s) => s.setEnabled);
  const profileKey = profileKeyOf(auth);
  const folders = profileKey ? foldersMap[profileKey] ?? [] : [];
  const disabled = new Set(profileKey ? disabledMap[profileKey] ?? [] : []);
  const enabledCount = folders.filter((f) => !disabled.has(f.id)).length;

  useEffect(() => {
    if (auth) void useLibraries.getState().load(auth);
  }, [auth]);

  function toggleLibrary(id: string, enabled: boolean) {
    if (!auth) return;
    // Nunca dejar todas apagadas: al menos una biblioteca visible.
    if (!enabled && enabledCount <= 1) {
      toast(t('Keep at least one library on'));
      return;
    }
    setEnabled(auth, id, enabled);
  }

  const [rescanning, setRescanning] = useState(false);
  const [changing, setChanging] = useState(false);

  async function chooseFolder() {
    const uri = await pickFolder();
    if (!uri) return;
    await setSource({ mode: 'folder', uri });
    setChanging(false);
    toast(t('Source updated'));
  }

  async function chooseDevice() {
    const ok = await ensureAudioPermission();
    if (!ok) {
      toast(t('We need permission to read your device music.'));
      return;
    }
    await setSource({ mode: 'device' });
    setChanging(false);
    toast(t('Source updated'));
  }

  async function rescanNow() {
    if (rescanning) return;
    setRescanning(true);
    toast(t('Rescanning your music…'));
    try {
      await rescanLocal();
      queryClient.invalidateQueries();
      toast(t('Library updated'));
    } catch {
      toast(t("Couldn't rescan"));
    } finally {
      setRescanning(false);
    }
  }

  const { data: scan, refetch: refetchScan } = useQuery({
    queryKey: ['scanStatus'],
    queryFn: () => getScanStatus(auth!),
    enabled: !!auth,
    // Mientras el servidor escanea, el contador se refresca solo.
    refetchInterval: (query) => (query.state.data?.scanning ? 2000 : false),
  });

  async function scanNow() {
    if (!auth) return;
    try {
      await startScan(auth);
      toast(t('Scan started'));
      setTimeout(() => refetchScan(), 1500);
    } catch {
      toast(t("Couldn't start the scan"));
    }
  }

  async function clearCache() {
    queryClient.clear();
    await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]).catch(() => {});
    toast(t('Cache cleared'));
  }

  return (
    <SettingsPage title={offline ? t('Local music') : t('Library')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        {offline ? (
          <>
            <Field
              label={t('Source')}
              value={source?.mode === 'folder' ? t('Folder') : t('Device')}
            />
            <SettingRow
              icon="refresh"
              label={rescanning ? t('Rescanning your music…') : t('Rescan')}
              onPress={rescanNow}
            />
            <SettingRow icon="swap-horizontal" label={t('Change source')} onPress={() => setChanging(true)} />
          </>
        ) : (
          <>
            {/* El primer título va pegado a la cabecera (sin el margen de sección). */}
            <Text style={[settingsStyles.sectionTitle, { marginTop: 0 }]}>{t('Scan')}</Text>
            <Field
              label={t('Scan status')}
              value={scan?.scanning ? t('Scanning…') : t('{n} items', { n: scan?.count ?? 0 })}
            />
            <SettingRow icon="refresh" label={t('Scan now')} onPress={scanNow} />

            {folders.length >= 2 ? (
              <>
                <Text style={settingsStyles.sectionTitle}>{t('Libraries')}</Text>
                <Text style={settingsStyles.sectionDescription}>
                  {t('Choose which libraries appear across the app.')}
                </Text>
                <SwitchList
                  options={folders.map((f) => ({
                    label: f.name,
                    value: !disabled.has(f.id),
                    onChange: (v) => toggleLibrary(f.id, v),
                  }))}
                />
              </>
            ) : null}
          </>
        )}

        {/* Separada del escaneo/origen: es mantenimiento, no configuración. */}
        <Text style={settingsStyles.sectionTitle}>{t('Storage')}</Text>
        <SettingRow icon="trash-outline" label={t('Clear cache')} onPress={clearCache} />
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={changing}
        onRequestClose={() => setChanging(false)}
      >
        <Pressable style={sheetStyles.backdrop} onPress={() => setChanging(false)} />
        <View style={[sheetStyles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={sheetStyles.title}>{t('Where should we get your music?')}</Text>

          <Pressable style={sheetStyles.option} onPress={chooseFolder}>
            <Ionicons name="folder-outline" size={26} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={sheetStyles.optionTitle}>{t('Choose a folder (recommended)')}</Text>
              <Text style={sheetStyles.optionSub}>{t('Only the music in the folder you choose.')}</Text>
            </View>
          </Pressable>

          <Pressable style={sheetStyles.option} onPress={chooseDevice}>
            <Ionicons name="phone-portrait-outline" size={26} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={sheetStyles.optionTitle}>{t('Scan the whole phone')}</Text>
              <Text style={sheetStyles.optionSub}>{t('All the music on your device.')}</Text>
            </View>
          </Pressable>
        </View>
      </Modal>
    </SettingsPage>
  );
}

const sheetStyles = StyleSheet.create({
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
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  optionTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  optionSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
});
