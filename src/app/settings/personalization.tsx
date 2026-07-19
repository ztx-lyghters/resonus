/** Ajustes › Aspecto: idioma, tema, listas de canciones e interfaz. */
import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import {
  SelectList,
  SettingRow,
  SettingsPage,
  settingsStyles,
  SwitchList,
} from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/auth';
import {
  APP_FONT_LABELS,
  LANGUAGE_NAMES,
  useSettings,
  type SwipeAction,
} from '@/store/settings';

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
  const showListRating = useSettings((s) => s.showListRating);
  const setShowListRating = useSettings((s) => s.setShowListRating);
  const showArtistPhoto = useSettings((s) => s.showArtistPhoto);
  const setShowArtistPhoto = useSettings((s) => s.setShowArtistPhoto);
  const showHistoryButton = useSettings((s) => s.showHistoryButton);
  const setShowHistoryButton = useSettings((s) => s.setShowHistoryButton);
  const showProfileButton = useSettings((s) => s.showProfileButton);
  const setShowProfileButton = useSettings((s) => s.setShowProfileButton);
  const swipeAction = useSettings((s) => s.swipeAction);
  const setSwipeAction = useSettings((s) => s.setSwipeAction);
  const swipeLeftAction = useSettings((s) => s.swipeLeftAction);
  const setSwipeLeftAction = useSettings((s) => s.setSwipeLeftAction);
  const showQuickGrid = useSettings((s) => s.showQuickGrid);
  const setShowQuickGrid = useSettings((s) => s.setShowQuickGrid);
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
            {
              label: t('Show rating'),
              description: t('Show each song’s star rating in lists.'),
              value: showListRating,
              onChange: setShowListRating,
            },
          ]}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Home')}</Text>
        <SwitchList
          options={[
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

        <SettingRow
          label={t('Explore chips')}
          description={t('Show, hide and reorder the chips at the top of Home.')}
          chevron
          onPress={() => router.push('/settings/explore-chips')}
        />

        <SettingRow
          label={t('Home sections')}
          description={t('Show, hide and reorder the album rows on Home.')}
          chevron
          onPress={() => router.push('/settings/home-sections')}
        />

        <SettingRow
          label={t('Greeting')}
          description={t('“Good morning”, “Good evening”… at the top of Home.')}
          chevron
          onPress={() => router.push('/settings/greeting')}
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

        <SettingRow
          label={t('Song menu')}
          description={t('Choose which actions show in a song\u2019s ⋯ menu.')}
          chevron
          onPress={() => router.push('/settings/song-menu')}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Interaction')}</Text>
        <SelectList<SwipeAction>
          label={t('Swipe right')}
          description={t('Action when you swipe a song to the right in lists.')}
          options={[
            { value: 'off', label: t('Off') },
            { value: 'queue', label: t('Add to queue') },
            { value: 'next', label: t('Play next') },
            { value: 'favorite', label: t('Add to favorites') },
            { value: 'menu', label: t('More options') },
          ]}
          value={swipeAction}
          onChange={setSwipeAction}
        />
        <SelectList<SwipeAction>
          label={t('Swipe left')}
          description={t('Action when you swipe a song to the left in lists.')}
          options={[
            { value: 'off', label: t('Off') },
            { value: 'queue', label: t('Add to queue') },
            { value: 'next', label: t('Play next') },
            { value: 'favorite', label: t('Add to favorites') },
            { value: 'menu', label: t('More options') },
          ]}
          value={swipeLeftAction}
          onChange={setSwipeLeftAction}
        />
        <SwitchList
          options={[
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
