/**
 * Ajustes › Calidad y reproducción: bitrate de streaming, crossfade, autoplay
 * y letras online. En modo offline solo se muestran los ajustes que aplican
 * en local (crossfade y letras online); el resto es de servidor. Lo relativo
 * a descargas vive en Ajustes › Descargas.
 */
import { ScrollView, Text } from 'react-native';

import { SelectList, SettingsPage, settingsStyles, SliderRow, SwitchList } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { BITRATE_OPTIONS, useSettings } from '@/store/settings';

export default function PlaybackSettings() {
  const t = useT();
  const offline = useAuthStore((s) => s.offline);
  const maxBitRate = useSettings((s) => s.maxBitRate);
  const setMaxBitRate = useSettings((s) => s.setMaxBitRate);
  const maxBitRateCellular = useSettings((s) => s.maxBitRateCellular);
  const setMaxBitRateCellular = useSettings((s) => s.setMaxBitRateCellular);
  const autoplaySimilar = useSettings((s) => s.autoplaySimilar);
  const setAutoplaySimilar = useSettings((s) => s.setAutoplaySimilar);
  const crossfadeSec = useSettings((s) => s.crossfadeSec);
  const setCrossfadeSec = useSettings((s) => s.setCrossfadeSec);
  const replayGain = useSettings((s) => s.replayGain);
  const setReplayGain = useSettings((s) => s.setReplayGain);
  const lyricsOnlineFallback = useSettings((s) => s.lyricsOnlineFallback);
  const setLyricsOnlineFallback = useSettings((s) => s.setLyricsOnlineFallback);
  const keepScreenAwake = useSettings((s) => s.keepScreenAwake);
  const setKeepScreenAwake = useSettings((s) => s.setKeepScreenAwake);

  const bitrateOptions = BITRATE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <SettingsPage title={t('Quality & playback')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        {offline ? null : (
          <>
            {/* El primer título va pegado a la cabecera (sin el margen de sección). */}
            <Text style={[settingsStyles.sectionTitle, { marginTop: 0 }]}>{t('Streaming')}</Text>
            <SelectList
              label={t('Streaming quality (Wi-Fi)')}
              description={t('“Original” uses the highest quality; a lower bitrate saves data.')}
              options={bitrateOptions}
              value={maxBitRate}
              onChange={setMaxBitRate}
            />
            <SelectList
              label={t('Streaming quality (mobile data)')}
              options={bitrateOptions}
              value={maxBitRateCellular}
              onChange={setMaxBitRateCellular}
            />
          </>
        )}

        {/* En offline no hay sección Streaming: este pasa a ser el primer título. */}
        <Text style={[settingsStyles.sectionTitle, offline && { marginTop: 0 }]}>
          {t('Playback')}
        </Text>
        <SliderRow
          label={t('Crossfade')}
          description={t('Songs blend into each other when one ends.')}
          value={crossfadeSec}
          max={12}
          formatValue={(v) => (v === 0 ? t('No') : `${v} s`)}
          onChange={setCrossfadeSec}
        />
        <SelectList
          label={t('Normalize volume')}
          description={t("Evens out loudness between songs using your files' ReplayGain tags.")}
          options={[
            { value: 'off', label: t('Off') },
            { value: 'auto', label: t('Automatic') },
            { value: 'track', label: t('By track') },
            { value: 'album', label: t('By album') },
          ]}
          value={replayGain}
          onChange={setReplayGain}
        />
        {offline ? null : (
          <SwitchList
            options={[
              {
                label: t('Autoplay'),
                description: t('Keep playing similar songs when your queue ends.'),
                value: autoplaySimilar,
                onChange: setAutoplaySimilar,
              },
            ]}
          />
        )}

        <Text style={settingsStyles.sectionTitle}>{t('Extras')}</Text>
        <SwitchList
          options={[
            {
              label: t('Find lyrics online'),
              description: t(
                'When a song has no lyrics, look them up on LRCLIB (sends the artist and title).',
              ),
              value: lyricsOnlineFallback,
              onChange: setLyricsOnlineFallback,
            },
            {
              label: t('Keep screen on'),
              description: t('The screen never turns off while the app is visible.'),
              value: keepScreenAwake,
              onChange: setKeepScreenAwake,
            },
          ]}
        />
      </ScrollView>
    </SettingsPage>
  );
}
