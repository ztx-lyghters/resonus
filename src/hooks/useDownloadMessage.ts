/**
 * Mensaje del diálogo que confirma una descarga. Además de cuántas canciones
 * son, dice cuánto van a ocupar: "8,3 GB" informa mucho más que "1.247
 * canciones", y es la diferencia entre aceptar a ciegas o no. Y si no cabe en
 * el aparato, lo avisa — mejor eso que una descarga que muere al 80 %.
 *
 * No hay umbral ni "¿seguro que quieres?": el tamaño ya se ve, y regañar por
 * descargas grandes sobra cuando la app tiene un ajuste de "solo Wi-Fi" para
 * expresar justo esa preocupación.
 */
import { Paths } from 'expo-file-system';
import { useMemo } from 'react';

import { type Song } from '@/api/subsonic';
import { songsLabel, useT } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { useSettings } from '@/store/settings';

/**
 * Lo que ocuparán estas canciones, o null si no se puede saber sin inventar.
 *
 * Con calidad reducida el servidor transcodifica a ese bitrate exacto, así que
 * basta la duración y sale casi clavado. Con calidad original hace falta el
 * bitrate de cada canción; en FLAC es el medio, así que la cifra baila algo.
 */
export function estimateDownloadBytes(songs: Song[], downloadBitRate: number): number | null {
  let bytes = 0;
  for (const s of songs) {
    // Las de radio y las que ya son locales no se bajan.
    if (s.url || s.localUri) continue;
    const kbps = downloadBitRate > 0 ? downloadBitRate : s.bitRate;
    if (!s.duration || !kbps) return null; // sin dato fiable, no se dice nada
    bytes += (s.duration * kbps * 1000) / 8;
  }
  return bytes;
}

/** Espacio libre del aparato, o null si el sistema no lo expone. */
function freeBytes(): number | null {
  try {
    const free = Paths.availableDiskSpace;
    return free >= 0 ? free : null;
  } catch {
    return null; // p. ej. plataforma sin soporte
  }
}

export function useDownloadMessage(songs: Song[]): { message: string; tight: boolean } {
  const t = useT();
  const lang = useSettings((s) => s.language);
  const downloadBitRate = useSettings((s) => s.downloadBitRate);

  return useMemo(() => {
    const label = songsLabel(songs.length, lang);
    const bytes = estimateDownloadBytes(songs, downloadBitRate);
    if (bytes == null) {
      return { message: t('{songs} will be saved to this device.', { songs: label }), tight: false };
    }
    const size = formatBytes(bytes);
    const free = freeBytes();
    if (free != null && bytes > free) {
      return {
        message: t('{songs} need about {size}, but only {free} is free. The download may stop partway.', {
          songs: label,
          size,
          free: formatBytes(free),
        }),
        tight: true,
      };
    }
    return {
      message: t('{songs} will be saved to this device (about {size}).', {
        songs: label,
        size,
      }),
      tight: false,
    };
  }, [songs, lang, downloadBitRate, t]);
}
