/**
 * Last played time per album and per artist, based on the playback history.
 *
 * Complements `useLastPlayed`, which only knows about what was opened from its
 * own screen (`/album/x`, `/artist/y`): this also counts what played inside a
 * playlist, favorites, or a mix. Anyone sorting by "recent" wants both.
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
