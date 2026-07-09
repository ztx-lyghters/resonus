/** Ajustes › Aspecto: idioma, tema, listas de canciones e interfaz. */
import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import {
  SettingRow,
  SettingsPage,
  settingsStyles,
  SwitchList,
} from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { LANGUAGE_NAMES, useSettings } from '@/store/settings';

export default function AppearanceSettings() {
  const router = useRouter();
  const t = useT();
  const language = useSettings((s) => s.language);
  const showListArtwork = useSettings((s) => s.showListArtwork);
  const setShowListArtwork = useSettings((s) => s.setShowListArtwork);
  const showSongDuration = useSettings((s) => s.showSongDuration);
  const setShowSongDuration = useSettings((s) => s.setShowSongDuration);
  const showArtistPhoto = useSettings((s) => s.showArtistPhoto);
  const setShowArtistPhoto = useSettings((s) => s.setShowArtistPhoto);
  const showHistoryButton = useSettings((s) => s.showHistoryButton);
  const setShowHistoryButton = useSettings((s) => s.setShowHistoryButton);
  const showProfileButton = useSettings((s) => s.showProfileButton);
  const setShowProfileButton = useSettings((s) => s.setShowProfileButton);
  const swipeToQueue = useSettings((s) => s.swipeToQueue);
  const setSwipeToQueue = useSettings((s) => s.setSwipeToQueue);
  const showQuickGrid = useSettings((s) => s.showQuickGrid);
  const setShowQuickGrid = useSettings((s) => s.setShowQuickGrid);

  return (
    <SettingsPage title={t('Appearance')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <SettingRow
          label={t('Language')}
          description={LANGUAGE_NAMES[language]}
          chevron
          onPress={() => router.push('/settings/language')}
        />
        <SettingRow
          label={t('Theme')}
          description={t('Accent color')}
          chevron
          onPress={() => router.push('/settings/theme')}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Song lists')}</Text>
        <SwitchList
          options={[
            {
              label: t('Show artwork'),
              description: t('Show the album artwork next to each song in playlists and favorites.'),
              value: showListArtwork,
              onChange: setShowListArtwork,
            },
            {
              label: t('Show song duration'),
              value: showSongDuration,
              onChange: setShowSongDuration,
            },
            {
              label: t('Swipe to queue'),
              description: t('Swipe a song to the right to add it to the queue.'),
              value: swipeToQueue,
              onChange: setSwipeToQueue,
            },
          ]}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Interface')}</Text>
        <SwitchList
          options={[
            {
              label: t('Show artist photo'),
              description: t('Show a round artist photo next to the name on album screens.'),
              value: showArtistPhoto,
              onChange: setShowArtistPhoto,
            },
            {
              label: t('Show quick grid'),
              description: t('The shortcut cards at the top of Home.'),
              value: showQuickGrid,
              onChange: setShowQuickGrid,
            },
            {
              label: t('Show history button'),
              description: t('The clock button on Home.'),
              value: showHistoryButton,
              onChange: setShowHistoryButton,
            },
            {
              label: t('Show profile button'),
              description: t('Your avatar on Home.'),
              value: showProfileButton,
              onChange: setShowProfileButton,
            },
          ]}
        />
      </ScrollView>
    </SettingsPage>
  );
}
