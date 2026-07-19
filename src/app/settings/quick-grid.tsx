/**
 * Ajustes › Aspecto › Quick grid: qué alimenta la rejilla de accesos rápidos
 * de Inicio y cuántos mosaicos mostrar. La rejilla es dinámica (ordena por
 * última escucha), así que aquí no se reordena: solo se eligen fuentes y tamaño.
 */
import { ScrollView, Text } from 'react-native';

import { SelectList, SettingsPage, settingsStyles, SwitchList } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { useSettings } from '@/store/settings';

const SIZES = [4, 6, 8] as const;

export default function QuickGridSettings() {
  const t = useT();
  // En local no hay playlists de servidor; la fuente se oculta para no prometer
  // algo que nunca aparece (misma idea que los chips solo-servidor).
  const offline = useAuthStore((s) => s.offline);
  const withFavorites = useSettings((s) => s.quickGridFavorites);
  const setWithFavorites = useSettings((s) => s.setQuickGridFavorites);
  const withAlbums = useSettings((s) => s.quickGridAlbums);
  const setWithAlbums = useSettings((s) => s.setQuickGridAlbums);
  const withPlaylists = useSettings((s) => s.quickGridPlaylists);
  const setWithPlaylists = useSettings((s) => s.setQuickGridPlaylists);
  const size = useSettings((s) => s.quickGridSize);
  const setSize = useSettings((s) => s.setQuickGridSize);

  const sources = [
    {
      label: t('Pin favorites'),
      description: t('Keep the Favorites tile first.'),
      value: withFavorites,
      onChange: setWithFavorites,
    },
    {
      label: t('Recent albums'),
      value: withAlbums,
      onChange: setWithAlbums,
    },
    ...(offline
      ? []
      : [
          {
            label: t('Playlists'),
            value: withPlaylists,
            onChange: setWithPlaylists,
          },
        ]),
  ];

  return (
    <SettingsPage title={t('Quick grid')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <Text style={settingsStyles.sectionTitle}>{t('Sources')}</Text>
        <SwitchList options={sources} />

        <Text style={settingsStyles.sectionTitle}>{t('Size')}</Text>
        <SelectList
          value={size}
          onChange={setSize}
          options={SIZES.map((n) => ({ value: n, label: t('{n} cards', { n }) }))}
        />
      </ScrollView>
    </SettingsPage>
  );
}
