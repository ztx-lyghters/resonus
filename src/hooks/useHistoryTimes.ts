/**
 * Última escucha por álbum y por artista, según el historial de reproducción.
 *
 * Complementa a `useLastPlayed`, que solo sabe de lo que se abrió desde su
 * pantalla (`/album/x`, `/artist/y`): esto también cuenta lo que sonó dentro de
 * una lista, de favoritos o de una mezcla. Quien ordene por "recientes" quiere
 * los dos.
 */
import { useMemo } from 'react';

import { usePlayHistory } from '@/store/playHistory';

export function useHistoryTimes(): {
  byAlbum: Map<string, number>;
  byArtist: Map<string, number>;
} {
  const entries = usePlayHistory((s) => s.entries);
  return useMemo(() => {
    const byAlbum = new Map<string, number>();
    const byArtist = new Map<string, number>();
    for (const e of entries) {
      const { albumId, artistId } = e.song;
      if (albumId && (byAlbum.get(albumId) ?? 0) < e.playedAt) byAlbum.set(albumId, e.playedAt);
      if (artistId && (byArtist.get(artistId) ?? 0) < e.playedAt) byArtist.set(artistId, e.playedAt);
    }
    return { byAlbum, byArtist };
  }, [entries]);
}
