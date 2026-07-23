/**
 * Resolves which artist(s) a song or album can navigate to. A single
 * option navigates directly; multiple (collaborations) opens the picker.
 */
import { type Album, type Song } from '@/api/subsonic';

export interface ArtistTarget {
  id: string;
  name: string;
}

/** Navigable artist list, no duplicates or empty ids. */
export function artistTargets(item: Pick<Song | Album, 'artist' | 'artistId' | 'artists'>): ArtistTarget[] {
  const list = (item.artists ?? []).filter((a) => a.id);
  if (list.length > 0) {
    const seen = new Set<string>();
    return list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }
  if (item.artistId) return [{ id: item.artistId, name: item.artist ?? '' }];
  return [];
}
