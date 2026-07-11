/** Etiqueta discreta con el formato, bitrate y si es lossless/Hi-Res. */
import { StyleSheet, Text } from 'react-native';

import { type Song } from '@/api/subsonic';
import { useT } from '@/i18n';
import { useDownloads } from '@/store/downloads';
import { useSettings } from '@/store/settings';
import { colors, fontSize } from '@/theme';

const LOSSLESS = new Set([
  'flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsd', 'dsf', 'wma',
]);

function qualityLabel(
  song: Song,
  maxBitRate: number,
  dlUri: string | undefined,
  t: (k: string) => string,
): string | null {
  if (song.localUri || !song.suffix) return null;
  const fmt = song.suffix.toUpperCase();
  if (dlUri) {
    // Descargada → suena desde disco: el límite de streaming no aplica. Si se
    // bajó transcodificada (la extensión ya no es la del original), las specs
    // del fichero original tampoco.
    const ext = dlUri.split('.').pop()?.toLowerCase();
    if (ext && ext !== song.suffix.toLowerCase()) {
      return `${fmt} → ${ext.toUpperCase()}`;
    }
  } else if (!song.url && maxBitRate > 0 && song.bitRate != null && song.bitRate > maxBitRate) {
    // Con límite de calidad activo y un original que lo supera, el servidor
    // transcodifica: la etiqueta refleja lo que suena de verdad, no el fichero
    // (nada de presumir de Lossless mientras llega un MP3 de 128).
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
  const maxBitRate = useSettings((s) => s.maxBitRate);
  const dlUri = useDownloads((s) => s.files[song.id]);
  const label = qualityLabel(song, maxBitRate, dlUri, t);
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
