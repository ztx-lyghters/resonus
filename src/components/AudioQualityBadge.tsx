/** Discreet label with format, bitrate, and whether it's lossless/Hi-Res. */
import { StyleSheet, Text } from 'react-native';

import { type Song } from '@/api/subsonic';
import { useT } from '@/i18n';
import { useDownloads } from '@/store/downloads';
import { useNetworkType } from '@/store/networkType';
import { useSettings } from '@/store/settings';
import { colors, fontSize } from '@/theme';

const LOSSLESS = new Set([
  'flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf', 'wma',
]);

function qualityLabel(
  song: Song,
  maxBitRate: number,
  dlUri: string | undefined,
  dlBitRate: number | undefined,
  t: (k: string) => string,
): string | null {
  // Without format there's nothing to show. Previously it was also hidden with
  // `localUri` (local/offline), but a downloaded song does have specs to
  // display: the real file format on disk (by its extension, via `dlUri`)
  // plus the server data. Offline is precisely when it matters most.
  if (!song.suffix) return null;
  const fmt = song.suffix.toUpperCase();
  if (dlUri) {
    // Downloaded → plays from disk: the streaming limit doesn't apply. If it was
    // downloaded transcoded (the extension no longer matches the original), the
    // original file specs no longer apply either.
    const ext = dlUri.split('.').pop()?.toLowerCase();
    if (ext && ext !== song.suffix.toLowerCase()) {
      // `dlBitRate` = bitrate requested when transcoding the download (only
      // carried by newer downloads; older ones lack the number).
      return dlBitRate
        ? `${fmt} → ${ext.toUpperCase()} ${dlBitRate} kbps`
        : `${fmt} → ${ext.toUpperCase()}`;
    }
  } else if (!song.url && !song.localUri && maxBitRate > 0 && song.bitRate != null && song.bitRate > maxBitRate) {
    // With a quality cap active and an original that exceeds it, the server
    // transcodes: the label reflects what actually plays, not the file
    // (no showing off "Lossless" while a 128kbps MP3 is arriving).
    return `${fmt} → ${maxBitRate} kbps`;
  }
  const parts: string[] = [fmt];

  const lossless = LOSSLESS.has(song.suffix.toLowerCase());
  const hiRes =
    (song.bitDepth != null && song.bitDepth > 16) ||
    (song.samplingRate != null && song.samplingRate > 48000);

  if (hiRes) {
    parts.push(t('Hi-Res'));
  } else if (lossless) {
    parts.push(t('Lossless'));
  }

  if (song.bitRate && song.bitRate > 0) {
    parts.push(`${song.bitRate} kbps`);
  }

  if (song.bitDepth || song.samplingRate) {
    const depth = song.bitDepth ? `${song.bitDepth}-bit` : '';
    const rate = song.samplingRate
      ? song.samplingRate >= 1000
        ? `${song.samplingRate / 1000} kHz`
        : `${song.samplingRate} Hz`
      : '';
    const sample = [depth, rate].filter(Boolean).join(' / ');
    if (sample) parts.push(sample);
  }

  return parts.join(' · ');
}

export function AudioQualityBadge({ song }: { song: Song }) {
  const t = useT();
  // Streaming quality depends on the current network (Wi-Fi or mobile data).
  const cellular = useNetworkType((s) => s.cellular);
  const maxBitRate = useSettings((s) => (cellular ? s.maxBitRateCellular : s.maxBitRate));
  const dlUri = useDownloads((s) => s.files[song.id]);
  const dlBitRate = useDownloads((s) => s.dlBitRates[song.id]);
  const label = qualityLabel(song, maxBitRate, dlUri, dlBitRate, t);
  if (!label) return null;
  return <Text style={styles.badge}>{label}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});
