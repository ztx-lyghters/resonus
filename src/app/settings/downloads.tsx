/**
 * Ajustes › Descargas: calidad, solo Wi-Fi, espacio usado (con barra visual
 * del disco, estilo Spotify) y borrado total. Reúne lo que antes vivía
 * repartido entre "Calidad y reproducción" y "Biblioteca". En offline queda
 * la versión reducida: espacio usado y borrar (liberar sitio sin conexión);
 * calidad y Wi-Fi solo aplican al descargar, que requiere servidor.
 */
import { Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Dialog } from '@/components/Dialog';
import {
  SelectList,
  SettingRow,
  SettingsPage,
  settingsStyles,
  SwitchList,
} from '@/components/SettingsUI';
import { songsLabel, useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { useDownloads } from '@/store/downloads';
import { BITRATE_OPTIONS, useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { colors, fontSize, spacing } from '@/theme';

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** Espacio del disco (total y libre), o null si el sistema no lo expone. */
function diskSpace(): { total: number; free: number } | null {
  try {
    const total = Paths.totalDiskSpace;
    const free = Paths.availableDiskSpace;
    if (total > 0 && free >= 0) return { total, free };
  } catch {
    // p. ej. plataforma sin soporte
  }
  return null;
}

/** Punto de color + etiqueta con tamaño, para la leyenda de la barra. */
function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>
        {label} · {value}
      </Text>
    </View>
  );
}

/** Color del segmento "otros" (lo ocupado por el resto del dispositivo). */
const OTHER_COLOR = '#7a7a7a';

export default function DownloadsSettings() {
  const t = useT();
  const toast = useToast((s) => s.show);
  const offline = useAuthStore((s) => s.offline);
  const lang = useSettings((s) => s.language);
  const downloadBitRate = useSettings((s) => s.downloadBitRate);
  const setDownloadBitRate = useSettings((s) => s.setDownloadBitRate);
  const downloadWifiOnly = useSettings((s) => s.downloadWifiOnly);
  const setDownloadWifiOnly = useSettings((s) => s.setDownloadWifiOnly);
  const files = useDownloads((s) => s.files);
  const usageBytes = useDownloads((s) => s.usageBytes);
  const clearAll = useDownloads((s) => s.clearAll);

  const [usage, setUsage] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = Object.keys(files).length;

  useEffect(() => {
    let active = true;
    usageBytes().then((n) => {
      if (active) setUsage(n);
    });
    return () => {
      active = false;
    };
  }, [usageBytes, count]);

  return (
    <SettingsPage title={t('Downloads')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        {offline ? null : (
          <>
            {/* El primer título va pegado a la cabecera (sin el margen de sección). */}
            <Text style={[settingsStyles.sectionTitle, { marginTop: 0 }]}>
              {t('Downloading')}
            </Text>
            <SelectList
              label={t('Download quality')}
              description={t('Applies to new downloads only.')}
              options={BITRATE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              value={downloadBitRate}
              onChange={setDownloadBitRate}
            />
            <SwitchList
              options={[
                {
                  label: t('Download over Wi-Fi only'),
                  description: t('Block downloads on mobile data.'),
                  value: downloadWifiOnly,
                  onChange: setDownloadWifiOnly,
                },
              ]}
            />
          </>
        )}
        {/* En offline no hay sección de descarga: este pasa a ser el primer título. */}
        <Text style={[settingsStyles.sectionTitle, offline && { marginTop: 0 }]}>
          {t('Storage used')}
        </Text>
        {(() => {
          const disk = diskSpace();
          if (!disk || usage == null) {
            return <Text style={styles.legendText}>{usage == null ? '…' : `${formatBytes(usage)} · ${songsLabel(count, lang)}`}</Text>;
          }
          const other = Math.max(0, disk.total - disk.free - usage);
          // Fracciones con un mínimo visible: unas descargas pequeñas en un
          // disco grande deben verse como una astilla, no desaparecer.
          const frac = (n: number) => Math.max(n > 0 ? 0.012 : 0, n / disk.total);
          return (
            <>
              <View style={styles.bar}>
                <View style={{ flex: frac(other), backgroundColor: OTHER_COLOR }} />
                <View style={{ flex: frac(usage), backgroundColor: colors.accent }} />
                <View style={{ flex: frac(disk.free), backgroundColor: colors.surfaceHighlight }} />
              </View>
              <View style={styles.legend}>
                <LegendItem color={OTHER_COLOR} label={t('Other')} value={formatBytes(other)} />
                <LegendItem
                  color={colors.accent}
                  label={t('Downloads')}
                  value={`${formatBytes(usage)} (${songsLabel(count, lang)})`}
                />
                <LegendItem
                  color={colors.surfaceHighlight}
                  label={t('Free')}
                  value={formatBytes(disk.free)}
                />
              </View>
            </>
          );
        })()}
        {count > 0 ? (
          <SettingRow
            icon="trash-outline"
            label={t('Delete all downloads')}
            destructive
            onPress={() => setConfirmDelete(true)}
          />
        ) : null}
      </ScrollView>

      <Dialog
        visible={confirmDelete}
        title={t('Delete all downloads?')}
        message={t('All downloaded music will be removed from this device.')}
        confirmLabel={t('Delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await clearAll();
          setUsage(0);
          toast(t('Downloads deleted'));
        }}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.textSecondary, fontSize: fontSize.xs },
});
