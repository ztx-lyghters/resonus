/**
 * Ajustes › Menú de canción: qué acciones se ven al tocar el ⋯ de una canción.
 *
 * Solo interruptores, sin arrastrar: el orden del menú lo pone el código (las
 * de organizar, las de navegar, las de reproducir…) y no se puede cambiar.
 *
 * Ojo: esconder una acción no la desactiva en el resto de la app. «Añadir a la
 * cola» y «Favoritos», por ejemplo, siguen estando en el gesto de deslizar.
 */
import { SettingsPage, SwitchList } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { useSettings, type SongMenuActionKey } from '@/store/settings';

/** Etiqueta (clave i18n) de cada acción. Las mismas que se pintan en el menú. */
const LABEL: Record<SongMenuActionKey, string> = {
  playlist: 'Add to a playlist',
  artist: 'Go to artist',
  album: 'Go to album',
  lyrics: 'Lyrics',
  mix: 'Start mix',
  playNext: 'Play next',
  queue: 'Add to queue',
  favorite: 'Add to favorites',
  download: 'Download',
  sleepTimer: 'Sleep timer',
};

/** Orden de los interruptores = orden real del menú, para reconocerlo de un vistazo. */
const ORDER: SongMenuActionKey[] = [
  'playlist',
  'artist',
  'album',
  'lyrics',
  'mix',
  'playNext',
  'queue',
  'favorite',
  'download',
  'sleepTimer',
];

export default function SongMenuSettings() {
  const t = useT();
  const offline = useAuthStore((s) => s.offline);
  const songMenuActions = useSettings((s) => s.songMenuActions);
  const setSongMenuAction = useSettings((s) => s.setSongMenuAction);
  // «Iniciar mix» no existe en local (las parecidas las busca el servidor):
  // su interruptor aquí prometería una acción que el menú nunca enseña.
  // «Descargar» se queda: en local sigue mandando sobre «Quitar descarga».
  const order = offline ? ORDER.filter((k) => k !== 'mix') : ORDER;

  return (
    <SettingsPage title={t('Song menu')}>
      <SwitchList
        options={order.map((key) => ({
          label: t(LABEL[key]),
          value: songMenuActions[key],
          onChange: (v: boolean) => setSongMenuAction(key, v),
        }))}
      />
    </SettingsPage>
  );
}
