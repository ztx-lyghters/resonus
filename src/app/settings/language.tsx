/** Language picker — list with a radio on the active language. */
import { Linking, ScrollView, Text } from 'react-native';

import { SelectList, SettingRow, SettingsPage, settingsStyles } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useSettings, type Language } from '@/store/settings';

// Repo de las traducciones. El bloque de ayuda va en inglés a propósito: lo
// leen sobre todo quienes no encuentran su idioma, así que el inglés es lo más
// universal.
const TRANSLATIONS_URL = 'https://github.com/juananzzz/resonus/tree/main/src/i18n/locales';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ca', label: 'Català' },
];

export default function LanguageSettings() {
  const t = useT();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);

  return (
    <SettingsPage title={t('Language')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <SelectList
          options={[...LANGUAGES].sort((a, b) => a.label.localeCompare(b.label))}
          value={language}
          onChange={setLanguage}
          collapsible={false}
        />

        <Text style={settingsStyles.sectionTitle}>Translations</Text>
        <Text style={settingsStyles.sectionDescription}>
          Don&apos;t see your language, or want to improve an existing one? You can help by
          contributing a translation on GitHub. Pull requests are welcome.
        </Text>
        <SettingRow
          icon="globe-outline"
          label="Help translate"
          onPress={() => Linking.openURL(TRANSLATIONS_URL)}
        />
      </ScrollView>
    </SettingsPage>
  );
}
