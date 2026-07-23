/**
 * Settings › Song menu: which actions appear when tapping the ⋯ of a song.
 *
 * Only toggles, no dragging: the menu order is set by the code (organizing,
 * navigating, playback…) and can't be changed.
 *
 * Note: hiding an action doesn't disable it in the rest of the app. «Add to
 * queue» and «Favorites», for example, are still available in the swipe
 * gesture.
 */
import { ScrollView } from 'react-native';

import { SettingsPage, settingsStyles, SwitchList } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { useSettings, type SongMenuActionKey } from '@/store/settings';

/** Label (i18n key) of each action. The same ones rendered in the menu. */
const LABEL: Record<SongMenuActionKey, string> = {
  playlist: 'Add to a playlist',
  artist: 'Go to artist',
  album: 'Go to album',
  lyrics: 'Lyrics',
  mix: 'Start mix',
  playNext: 'Play next',
  queue: 'Add to queue',
  favorite: 'Add to favorites',
  rating: 'Rate',
  download: 'Download',
  sleepTimer: 'Sleep timer',
};

/** Toggle order = actual menu order, to recognize it at a glance. */
const ORDER: SongMenuActionKey[] = [
  'playlist',
  'artist',
  'album',
  'lyrics',
  'mix',
  'playNext',
  'queue',
  'favorite',
  'rating',
  'download',
  'sleepTimer',
];

export default function SongMenuSettings() {
  const t = useT();
  const offline = useAuthStore((s) => s.offline);
  const songMenuActions = useSettings((s) => s.songMenuActions);
  const setSongMenuAction = useSettings((s) => s.setSongMenuAction);
  // «Start mix» and «Rate» don't exist locally (similar tracks and rating are
  // server-side): their toggles would promise actions the menu never shows.
  // «Download» stays: locally it controls «Remove download».
  const order = offline ? ORDER.filter((k) => k !== 'mix' && k !== 'rating') : ORDER;

  return (
    <SettingsPage title={t('Song menu')}>
      {/* `SettingsPage` renders its children as-is: the margin is set by this
          ScrollView, like the rest of Settings. And with ten toggles you need
          to be able to scroll on shorter screens or with large text. */}
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <SwitchList
          options={order.map((key) => ({
            label: t(LABEL[key]),
            value: songMenuActions[key],
            onChange: (v: boolean) => setSongMenuAction(key, v),
          }))}
        />
      </ScrollView>
    </SettingsPage>
  );
}
