/**
 * Ajustes › Descargas: calidad, solo Wi-Fi, espacio usado y borrado total.
 * Reúne lo que antes vivía repartido entre "Calidad y reproducción" y
 * "Biblioteca". Solo tiene sentido con servidor (en offline no se descarga).
 */
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { Dialog } from '@/components/Dialog';
import {
  Field,
  SelectList,
  SettingRow,
  SettingsPage,
  settingsStyles,
  SwitchList,
} from '@/components/SettingsUI';
import { songsLabel, useT } from '@/i18n';
import { useDownloads } from '@/store/downloads';
import { BITRATE_OPTIONS, useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export default function DownloadsSettings() {
  const t = useT();
  const toast = useToast((s) => s.show);
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
        <SelectList
          label={t('Download quality')}
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
        <Field
          label={t('Storage used')}
          value={usage == null ? '…' : `${formatBytes(usage)} · ${songsLabel(count, lang)}`}
        />
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
