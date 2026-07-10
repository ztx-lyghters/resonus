/** Ajustes › Reproductor: aspecto y extras de la pantalla de reproducción. */
import { ScrollView } from 'react-native';

import { SettingsPage, settingsStyles, SwitchList } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useSettings } from '@/store/settings';

export default function PlayerSettings() {
  const t = useT();
  const showAudioQuality = useSettings((s) => s.showAudioQuality);
  const setShowAudioQuality = useSettings((s) => s.setShowAudioQuality);
  const showRating = useSettings((s) => s.showRating);
  const setShowRating = useSettings((s) => s.setShowRating);
  const playerColorBackground = useSettings((s) => s.playerColorBackground);
  const setPlayerColorBackground = useSettings((s) => s.setPlayerColorBackground);
  const miniPlayerColorBackground = useSettings((s) => s.miniPlayerColorBackground);
  const setMiniPlayerColorBackground = useSettings((s) => s.setMiniPlayerColorBackground);
  const lyricsColorBackground = useSettings((s) => s.lyricsColorBackground);
  const setLyricsColorBackground = useSettings((s) => s.setLyricsColorBackground);
  const showLyricsCard = useSettings((s) => s.showLyricsCard);
  const setShowLyricsCard = useSettings((s) => s.setShowLyricsCard);
  const marqueeTitles = useSettings((s) => s.marqueeTitles);
  const setMarqueeTitles = useSettings((s) => s.setMarqueeTitles);
  const showQueueButton = useSettings((s) => s.showQueueButton);
  const setShowQueueButton = useSettings((s) => s.setShowQueueButton);
  const showDevicesButton = useSettings((s) => s.showDevicesButton);
  const setShowDevicesButton = useSettings((s) => s.setShowDevicesButton);

  return (
    <SettingsPage title={t('Player')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <SwitchList
          options={[
            {
              label: t('Colored background'),
              description: t('Tint the player background with the cover color.'),
              value: playerColorBackground,
              onChange: setPlayerColorBackground,
            },
            {
              label: t('Colored mini player'),
              description: t('Tint the mini player with the cover color.'),
              value: miniPlayerColorBackground,
              onChange: setMiniPlayerColorBackground,
            },
            {
              label: t('Colored lyrics screen'),
              description: t('Tint the lyrics screen with the cover color.'),
              value: lyricsColorBackground,
              onChange: setLyricsColorBackground,
            },
            {
              label: t('Show quality label'),
              description: t('Show format, bitrate and Lossless / Hi-Res in the player.'),
              value: showAudioQuality,
              onChange: setShowAudioQuality,
            },
            {
              label: t('Show rating'),
              description: t('Show a star rating bar to rate the current song.'),
              value: showRating,
              onChange: setShowRating,
            },
            {
              label: t('Show lyrics card'),
              description: t('The lyrics card below the player controls.'),
              value: showLyricsCard,
              onChange: setShowLyricsCard,
            },
            {
              label: t('Scroll long titles'),
              description: t("Song and artist names that don't fit scroll across."),
              value: marqueeTitles,
              onChange: setMarqueeTitles,
            },
            {
              label: t('Show queue button'),
              value: showQueueButton,
              onChange: setShowQueueButton,
            },
            {
              label: t('Show devices button'),
              value: showDevicesButton,
              onChange: setShowDevicesButton,
            },
          ]}
        />
      </ScrollView>
    </SettingsPage>
  );
}
