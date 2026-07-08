/**
 * Conjunto de IDs favoritos (de la lista central `getStarred`). Fuente de
 * verdad fiable para mostrar el corazón, ya que los endpoints de detalle
 * (getAlbum/getArtist) traen un `starred` que no se refresca al marcar; esta
 * query se comparte por clave entre todos los consumidores y se invalida al
 * marcar/desmarcar. `type` elige canciones (por defecto), álbumes o artistas.
 */
import { useQuery } from '@tanstack/react-query';

import { getStarred, type StarType } from '@/api/data';
import { useAuthStore } from '@/store/auth';

export function useFavoriteIds(enabled = true, type: StarType = 'song'): Set<string> | undefined {
  const canFetch = useAuthStore((s) => !!s.auth || s.offline);
  const { data } = useQuery({
    queryKey: ['starred'],
    queryFn: () => getStarred(),
    enabled: enabled && canFetch,
    select: (d) =>
      new Set(
        (type === 'album' ? d.albums : type === 'artist' ? d.artists : d.songs).map((x) => x.id),
      ),
  });
  return data;
}
