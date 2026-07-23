/**
 * Set of favorite IDs (from the central `getStarred` list). Reliable source
 * of truth for showing the heart, since the detail endpoints (getAlbum/getArtist)
 * return a `starred` field that doesn't refresh when toggling; this query is
 * shared by key across all consumers and is invalidated on star/unstar. `type`
 * picks songs (default), albums, or artists.
 */
import { useQuery } from '@tanstack/react-query';

import { getStarred, type StarType } from '@/api/data';
import { type Starred } from '@/api/subsonic';
import { useAuthStore } from '@/store/auth';

// One Set per `Starred` object (and per type), shared across ALL rows. React
// Query delivers the same `data` object to all consumers as long as it isn't
// invalidated, so the WeakMap always returns the same Set: it isn't rebuilt
// per row or per render. It used to be done in an inline `select`, which
// (without memoization) recreated the Set of all favorites on every render of
// every TrackRow — a real cost when mounting rows during scroll.
const setCache = new WeakMap<Starred, Partial<Record<StarType, Set<string>>>>();

function idSet(data: Starred, type: StarType): Set<string> {
  let entry = setCache.get(data);
  if (!entry) {
    entry = {};
    setCache.set(data, entry);
  }
  let set = entry[type];
  if (!set) {
    const list = type === 'album' ? data.albums : type === 'artist' ? data.artists : data.songs;
    set = new Set(list.map((x) => x.id));
    entry[type] = set;
  }
  return set;
}

export function useFavoriteIds(enabled = true, type: StarType = 'song'): Set<string> | undefined {
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const { data } = useQuery({
    queryKey: ['starred'],
    queryFn: () => getStarred(),
    enabled: enabled && canFetch,
  });
  return data ? idSet(data, type) : undefined;
}
