/**
 * Plays random songs from the library (or a genre) instantly.
 *
 * This is an ACTION, not a destination: "random" literally means "don't make
 * me choose", so showing a list before playing contradicts what was asked.
 * Whatever plays is visible in the queue, which already exists and also lets
 * you reorder and remove — it was a better screen than whatever was here.
 */
import { getRandomSongs } from '@/api/data';
import { tg } from '@/i18n';
import { usePlayerStore } from '@/store/player';
import { useToast } from '@/store/toast';

/** Not the entire library: the endpoint caps ~500 and a queue that size is unusable. */
const SHUFFLE_SIZE = 200;

/** Empty `genre` = entire library. Genres are server-side. */
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
  // The server already returns them in random order: no shuffling here nor
  // enabling shuffle mode, which would re-shuffle the already-shuffled.
  await usePlayerStore.getState().playQueue(songs, 0, genre || tg('Shuffle'));
}
