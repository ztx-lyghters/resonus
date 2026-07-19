/**
 * Ajustes › Secciones de Inicio: lista arrastrable (mismo motor que la cola y
 * las playlists) para mostrar/ocultar y reordenar las filas de álbumes de
 * Inicio. Los cambios se aplican y guardan al momento.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import ReorderableList, {
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, settingsStyles } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/auth';
import { useSettings, type HomeSection, type HomeSectionKey } from '@/store/settings';
import { colors, fontSize, radius, spacing, SCREEN_BOTTOM_PADDING } from '@/theme';

/** Etiqueta (clave i18n) de cada sección. */
const LABEL: Record<HomeSectionKey, string> = {
  recentlyAdded: 'Recently added',
  recentlyPlayed: 'Recently played',
  mostPlayed: 'Most played',
  discover: 'Discover',
  playlists: 'Playlists',
  randomAlbums: 'Random albums',
  randomArtists: 'Random artists',
};

function SectionRow({ section }: { section: HomeSection }) {
  const t = useT();
  const drag = useReorderableDrag();
  const setHomeSection = useSettings((s) => s.setHomeSection);
  // Del store, no de `colors.accent`: sin suscripción el switch se quedaría con
  // el acento anterior mientras la pantalla siga montada.
  const accent = useSettings((s) => s.accentColor);
  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={8}
        onPressIn={() => {
          haptic('medium');
          drag();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('Reorder')}
      >
        <Ionicons name="reorder-two" size={24} color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.label}>{t(LABEL[section.key])}</Text>
      <Switch
        value={section.enabled}
        onValueChange={(v) => setHomeSection(section.key, v)}
        trackColor={{ false: colors.border, true: accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

/** Secciones que en local no existen: su fila aquí prometería algo que Inicio
 *  nunca pinta (mismo criterio que el navegador de carpetas en Aspecto). */
const SERVER_ONLY: HomeSectionKey[] = ['discover'];

export default function HomeSectionsSettings() {
  const t = useT();
  const offline = useAuthStore((s) => s.offline);
  const homeSections = useSettings((s) => s.homeSections);
  const setHomeSections = useSettings((s) => s.setHomeSections);
  const visible = offline
    ? homeSections.filter((s) => !SERVER_ONLY.includes(s.key))
    : homeSections;

  return (
    <SafeAreaView style={settingsStyles.safe} edges={['top']}>
      <ScreenHeader title={t('Home sections')} />
      <Text style={styles.hint}>{t('Drag to reorder, toggle to show or hide.')}</Text>
      <ReorderableList
        data={visible}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <SectionRow section={item} />}
        onReorder={({ from, to }: ReorderableListReorderEvent) => {
          const nextVisible = visible.slice();
          const [moved] = nextVisible.splice(from, 1);
          nextVisible.splice(to, 0, moved);
          // Las ocultas vuelven a su posición absoluta: reordenar en local no
          // debe perder ni recolocar la config de las filas solo-servidor.
          let vi = 0;
          const next = homeSections.map((s) =>
            offline && SERVER_ONLY.includes(s.key) ? s : nextVisible[vi++],
          );
          setHomeSections(next);
        }}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: SCREEN_BOTTOM_PADDING },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  label: { flex: 1, color: colors.text, fontSize: fontSize.md },
});
