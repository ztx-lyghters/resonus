/**
 * Conjunto de IDs favoritos (de la lista central `getStarred`). Fuente de
 * verdad fiable para mostrar el corazón, ya que los endpoints de detalle
 * (getAlbum/getArtist) traen un `starred` que no se refresca al marcar; esta
 * query se comparte por clave entre todos los consumidores y se invalida al
 * marcar/desmarcar. `type` elige canciones (por defecto), álbumes o artistas.
 */
import { useQuery } from '@tanstack/react-query';

import { getStarred, type StarType } from '@/api/data';
import { type Starred } from '@/api/subsonic';
import { useAuthStore } from '@/store/auth';

// Un Set por objeto `Starred` (y por tipo), compartido entre TODAS las filas.
// React Query entrega el mismo objeto `data` a todos los consumidores mientras
// no se invalide, así que el WeakMap devuelve siempre el mismo Set: no se
// reconstruye por fila ni por render. Antes se hacía en un `select` inline, que
// al no memoizarse recreaba el Set con todos los favoritos en cada render de
// cada TrackRow (coste real al montar filas mientras se hace scroll).
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
