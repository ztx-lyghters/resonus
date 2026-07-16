/**
 * Reproduce canciones al azar de la biblioteca (o de un género) al momento.
 *
 * Es una ACCIÓN, no un destino: "aleatorio" significa literalmente "no me hagas
 * elegir", así que enseñar una lista antes de sonar contradice lo que se pidió.
 * Lo que va a sonar se ve en la cola, que ya existe y además deja reordenar y
 * quitar — era mejor pantalla que la que había aquí.
 */
import { getRandomSongs } from '@/api/data';
import { tg } from '@/i18n';
import { usePlayerStore } from '@/store/player';
import { useToast } from '@/store/toast';

/** No es la biblioteca entera: el endpoint topa ~500 y una cola así no se usa. */
const SHUFFLE_SIZE = 200;

/** `genre` vacío = toda la biblioteca. Los géneros son cosa del servidor. */
export async function playShuffle(genre?: string): Promise<void> {
  let songs;
  try {
    songs = await getRandomSongs(SHUFFLE_SIZE, genre);
  } catch {
    useToast.getState().show(tg("Couldn't load songs."));
    return;
  }
  if (songs.length === 0) {
    useToast.getState().show(tg('Nothing to shuffle yet'));
    return;
  }
  // Ya vienen en orden azaroso del servidor: ni barajar aquí ni activar el modo
  // aleatorio, que sería rebarajar lo ya barajado.
  await usePlayerStore.getState().playQueue(songs, 0, genre || tg('Shuffle'));
}
