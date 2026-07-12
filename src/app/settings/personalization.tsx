/** Ajustes › Aspecto: idioma, tema, listas de canciones e interfaz. */
import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { SettingRow, SettingsPage, settingsStyles, SwitchList } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/auth';
import { APP_FONT_LABELS, LANGUAGE_NAMES, useSettings } from '@/store/settings';

export default function AppearanceSettings() {
  const router = useRouter();
  const t = useT();
  // La pestaña de carpetas solo existe con servidor Subsonic (ver library):
  // en offline o Jellyfin el toggle no haría nada, así que no se muestra.
  const offline = useAuthStore((s) => s.offline);
  const serverType = useAuthStore((s) => s.auth?.serverType);
  const canBrowseFolders = !offline && serverType !== 'jellyfin';
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
  const showExploreChips = useSettings((s) => s.showExploreChips);
  const setShowExploreChips = useSettings((s) => s.setShowExploreChips);
  const showFolderBrowser = useSettings((s) => s.showFolderBrowser);
  const setShowFolderBrowser = useSettings((s) => s.setShowFolderBrowser);
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettings((s) => s.setHapticsEnabled);
  const appFont = useSettings((s) => s.appFont);

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
        <SettingRow
          label={t('Font')}
          description={APP_FONT_LABELS[appFont]}
          chevron
          onPress={() => router.push('/settings/font')}
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
          ]}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Home')}</Text>
        <SwitchList
          options={[
            {
              label: t('Show explore chips'),
              description: t('The Albums, Artists, Genres and Radio chips on Home.'),
              value: showExploreChips,
              onChange: setShowExploreChips,
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

        <Text style={settingsStyles.sectionTitle}>{t('Interface')}</Text>
        <SwitchList
          options={[
            {
              label: t('Show artist photo'),
              description: t('Show a round artist photo next to the name on album screens.'),
              value: showArtistPhoto,
              onChange: setShowArtistPhoto,
            },
            ...(canBrowseFolders
              ? [
                  {
                    label: t('Folder browsing'),
                    description: t(
                      'Browse your library by folders in a Folders tab (Subsonic servers).',
                    ),
                    value: showFolderBrowser,
                    onChange: setShowFolderBrowser,
                  },
                ]
              : []),
          ]}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Interaction')}</Text>
        <SwitchList
          options={[
            {
              label: t('Swipe to queue'),
              description: t('Swipe a song to the right to add it to the queue.'),
              value: swipeToQueue,
              onChange: setSwipeToQueue,
            },
            {
              label: t('Haptic feedback'),
              description: t('Subtle vibration on key actions.'),
              value: hapticsEnabled,
              onChange: (v: boolean) => {
                setHapticsEnabled(v);
                // Vibra al activarlo: confirmación inmediata de que funciona.
                if (v) haptic('medium');
              },
            },
          ]}
        />
      </ScrollView>
    </SettingsPage>
  );
}
