/**
 * Ajustes › Ecualizador: interruptor, presets del dispositivo y una banda por
 * fila. El procesado lo hace el ecualizador del sistema (módulo nativo
 * modules/audio-eq); aquí solo se eligen las ganancias, que se guardan y se
 * aplican al audio de la app al momento.
 */
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import {
  SelectList,
  SettingRow,
  SettingsPage,
  settingsStyles,
  SliderRow,
  SwitchList,
} from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useEqualizer } from '@/store/equalizer';

/** 62 → «62 Hz»; 16000 → «16 kHz». */
function formatFreq(hz: number): string {
  return hz >= 1000 ? `${Math.round(hz / 100) / 10} kHz` : `${hz} Hz`;
}

/** Milibelios → «+3.0 dB». */
function formatGain(millibels: number): string {
  const db = millibels / 100;
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export default function EqualizerSettings() {
  const t = useT();
  const supported = useEqualizer((s) => s.supported);
  const bands = useEqualizer((s) => s.bands);
  const minLevel = useEqualizer((s) => s.minLevel);
  const maxLevel = useEqualizer((s) => s.maxLevel);
  const presets = useEqualizer((s) => s.presets);
  const enabled = useEqualizer((s) => s.enabled);
  const levels = useEqualizer((s) => s.levels);
  const setEnabled = useEqualizer((s) => s.setEnabled);
  const setBandLevel = useEqualizer((s) => s.setBandLevel);
  const applyPreset = useEqualizer((s) => s.applyPreset);
  const reset = useEqualizer((s) => s.reset);

  // El preset elegido es solo de la vista: al tocar una banda deja de haber
  // preset («Personalizado»). Lo que se guarda son las ganancias.
  const [preset, setPreset] = useState(-1);

  if (!supported) {
    return (
      <SettingsPage title={t('Equalizer')}>
        <ScrollView contentContainerStyle={settingsStyles.content}>
          <Text style={settingsStyles.sectionDescription}>
            {t('This device does not offer an equalizer.')}
          </Text>
        </ScrollView>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title={t('Equalizer')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <SwitchList
          options={[
            {
              label: t('Equalizer'),
              description: t('Apply the equalizer to the app audio.'),
              value: enabled,
              onChange: setEnabled,
            },
          ]}
        />

        {presets.length > 0 ? (
          <SelectList
            label={t('Preset')}
            options={[
              { value: -1, label: t('Custom') },
              ...presets.map((name, i) => ({ value: i, label: name })),
            ]}
            value={preset}
            onChange={(v) => {
              setPreset(v);
              if (v >= 0) applyPreset(v);
            }}
          />
        ) : null}

        <Text style={settingsStyles.sectionTitle}>{t('Bands')}</Text>
        {bands.map((band) => (
          <SliderRow
            key={band.index}
            label={formatFreq(band.centerFreq)}
            value={levels[band.index] ?? 0}
            min={minLevel}
            max={maxLevel}
            // Pasos de 1 dB: el rango viene en milibelios.
            step={100}
            formatValue={formatGain}
            onChange={(v) => {
              setPreset(-1);
              setBandLevel(band.index, v);
            }}
          />
        ))}

        <SettingRow
          icon="arrow-undo-outline"
          label={t('Reset bands')}
          onPress={() => {
            setPreset(-1);
            reset();
          }}
        />
      </ScrollView>
    </SettingsPage>
  );
}
