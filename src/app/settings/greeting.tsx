/**
 * Ajustes › Saludo: si se muestra el saludo de Inicio y con qué texto.
 *
 * Pantalla propia, aunque solo tenga dos cosas: en Aspecto ocupaban un
 * interruptor más una tarjeta con su campo de texto, y esa fila de Inicio ya
 * iba cargada.
 */
import { ScrollView } from 'react-native';

import { SettingsPage, settingsStyles, SwitchList, TextRow } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { GREETING_MAX, useSettings } from '@/store/settings';

export default function GreetingSettings() {
  const t = useT();
  const showGreeting = useSettings((s) => s.showGreeting);
  const setShowGreeting = useSettings((s) => s.setShowGreeting);
  const customGreeting = useSettings((s) => s.customGreeting);
  const setCustomGreeting = useSettings((s) => s.setCustomGreeting);

  return (
    <SettingsPage title={t('Greeting')}>
      {/* `SettingsPage` pinta a sus hijos tal cual: el margen y la separación
          entre tarjetas los pone este ScrollView, como el resto de Ajustes. */}
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <SwitchList
          options={[
            {
              label: t('Show greeting'),
              description: t('“Good morning”, “Good evening”… at the top of Home.'),
              value: showGreeting,
              onChange: setShowGreeting,
            },
          ]}
        />

        {/* Solo con el saludo visible: un campo para un texto que no se pinta
            en ningún sitio sería una promesa falsa. */}
        {showGreeting ? (
          <TextRow
            label={t('Custom greeting')}
            description={t('Leave it empty to greet you by the time of day.')}
            value={customGreeting}
            placeholder={t('Good evening')}
            maxLength={GREETING_MAX}
            onChange={setCustomGreeting}
          />
        ) : null}
      </ScrollView>
    </SettingsPage>
  );
}
