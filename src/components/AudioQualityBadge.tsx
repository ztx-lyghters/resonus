/** Etiqueta discreta con el formato, bitrate y si es lossless/Hi-Res. */
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
  // Sin formato no hay nada que enseñar. Antes también se ocultaba con
  // `localUri` (local/offline), pero una canción descargada sí tiene specs que
  // mostrar: el formato real del fichero en disco (por su extensión, vía
  // `dlUri`) más los datos del servidor. Offline es justo cuando más importa.
  if (!song.suffix) return null;
  const fmt = song.suffix.toUpperCase();
  if (dlUri) {
    // Descargada → suena desde disco: el límite de streaming no aplica. Si se
    // bajó transcodificada (la extensión ya no es la del original), las specs
    // del fichero original tampoco.
    const ext = dlUri.split('.').pop()?.toLowerCase();
    if (ext && ext !== song.suffix.toLowerCase()) {
      // `dlBitRate` = bitrate que se pidió al transcodificar la descarga (solo lo
      // llevan las bajadas nuevas; las viejas se quedan sin el número, sin más).
      return dlBitRate
        ? `${fmt} → ${ext.toUpperCase()} ${dlBitRate} kbps`
        : `${fmt} → ${ext.toUpperCase()}`;
    }
  } else if (!song.url && !song.localUri && maxBitRate > 0 && song.bitRate != null && song.bitRate > maxBitRate) {
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
  // La calidad de streaming depende de la red actual (Wi-Fi o datos móviles).
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
