/**
 * Ajustes estilo Spotify: la cuenta arriba como fila de perfil (avatar +
 * nombre + servidor), las categorías como filas planas, restaurar ajustes,
 * el botón píldora de cerrar sesión y un pie con el enlace al repositorio.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dialog } from '@/components/Dialog';
import { ScreenHeader, settingsStyles } from '@/components/SettingsUI';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { useDownloads } from '@/store/downloads';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { colors, fontSize, radius, spacing } from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const t = useT();
  const auth = useAuthStore((s) => s.auth);
  // El anillo del avatar lee el acento del store para recolorearse al cambiarlo.
  const accentColor = useSettings((s) => s.accentColor);
  useSettings((s) => s.appFont); // re-render al cambiar la fuente
  const resetToDefaults = useSettings((s) => s.resetToDefaults);
  const logout = useAuthStore((s) => s.logout);
  const goOnline = useAuthStore((s) => s.goOnline);
  const goOffline = useAuthStore((s) => s.goOffline);
  const offline = useAuthStore((s) => s.offline);
  // Solo ofrecemos "ir offline" a mano si hay algo descargado que oír.
  const hasDownloads = useDownloads((s) => Object.keys(s.files).length > 0);
  const toast = useToast((s) => s.show);
  // Restaurar valores por defecto: afecta a todos los ajustes, por eso vive
  // aquí (en el índice) y no dentro de una categoría concreta.
  const [confirmReset, setConfirmReset] = useState(false);

  // Cuenta de servidor en modo offline (auth intacto) vs perfil local (sin auth).
  const serverOffline = offline && !!auth;
  const initial = serverOffline
    ? (auth?.username ?? '?').charAt(0).toUpperCase()
    : offline
      ? 'O'
      : (auth?.username ?? '?').charAt(0).toUpperCase();
  const name = offline && !auth ? t('Local profile') : auth?.username ?? '—';
  const detail = serverOffline
    ? t('Offline · your downloads')
    : offline
      ? t('Music on your device')
      : auth?.serverUrl.replace(/^https?:\/\//, '') ?? '';

  // En offline, Reproducción también aparece: la propia pantalla oculta lo
  // que es de servidor (bitrates, autoplay) y deja lo que aplica en local
  // (crossfade, letras online). "Biblioteca" pasa a ser la música local.
  const sections: { key: string; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'playback', title: 'Quality & playback', icon: 'musical-notes-outline' as const },
    { key: 'player', title: 'Player', icon: 'play-circle-outline' as const },
    // En offline la pantalla de Descargas se reduce a espacio usado y borrado
    // (sin servidor no se descarga, pero liberar espacio sigue siendo útil).
    { key: 'downloads', title: 'Downloads', icon: 'download-outline' as const },
    // Biblioteca: online es la del servidor; en perfil local, la música del
    // dispositivo. En servidor-offline se oculta: su contenido es de servidor
    // (escaneo, bibliotecas) que no aplica sin conexión, y la gestión de las
    // descargas ya vive en la sección "Downloads" de arriba (evita duplicarla).
    ...(serverOffline
      ? []
      : [
          {
            key: 'library',
            title: offline ? 'Local music' : 'Library',
            icon: offline
              ? ('phone-portrait-outline' as const)
              : ('server-outline' as const),
          },
        ]),
    // Red: varias URLs de servidor y conmutación automática. Solo con servidor.
    ...(offline
      ? []
      : [{ key: 'network', title: 'Network (experimental)', icon: 'git-network-outline' as const }]),
    // Tema vive dentro de Aspecto (fila con chevron, como Idioma).
    { key: 'personalization', title: 'Appearance', icon: 'color-palette-outline' as const },
    { key: 'about', title: 'About', icon: 'information-circle-outline' as const },
  ];

  return (
    <SafeAreaView style={settingsStyles.safe} edges={['top']}>
      <ScreenHeader title={t('Settings')} />
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { borderColor: accentColor }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={settingsStyles.rowLabelBox}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={settingsStyles.rowDescription} numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </View>

        {sections.map((s) => (
          <Pressable
            key={s.key}
            style={({ pressed }) => [styles.sectionRow, pressed && { opacity: 0.6 }]}
            onPress={() => router.push(`/settings/${s.key}`)}
          >
            <Ionicons name={s.icon} size={24} color={colors.text} />
            <Text style={styles.sectionRowTitle}>{t(s.title)}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))}

        <Pressable
          style={({ pressed }) => [styles.sectionRow, pressed && { opacity: 0.6 }]}
          onPress={() => setConfirmReset(true)}
        >
          <Ionicons name="arrow-undo-outline" size={24} color={colors.textSecondary} />
          <Text style={[styles.sectionRowTitle, { color: colors.textSecondary }]}>
            {t('Restore default settings')}
          </Text>
        </Pressable>

        <View style={styles.sessionRow}>
          {/* Acción de MODO (pastilla de contorno, a la izquierda): igual
              colocación en online y en offline. Online con descargas: ir offline
              a mano; offline de servidor: volver online. Ambas recargan la
              biblioteca, así que llevan a Inicio. */}
          {!offline && auth && hasDownloads ? (
            <Pressable
              style={({ pressed }) => [styles.offlinePill, pressed && { opacity: 0.6 }]}
              onPress={() => {
                void goOffline(false);
                toast(t('Offline · your downloads'));
                router.replace('/(tabs)');
              }}
            >
              <Ionicons name="cloud-offline-outline" size={18} color="#000" />
              <Text style={styles.offlinePillText}>{t('Offline mode')}</Text>
            </Pressable>
          ) : serverOffline ? (
            <Pressable
              style={({ pressed }) => [styles.offlinePill, pressed && { opacity: 0.6 }]}
              onPress={() => {
                void goOnline();
                router.replace('/(tabs)');
              }}
            >
              <Ionicons name="cloud-outline" size={18} color="#000" />
              <Text style={styles.offlinePillText}>{t('Back online')}</Text>
            </Pressable>
          ) : null}

          {/* Cerrar sesión (pastilla de contorno oscura + icono): mismo estilo
              y posición en online y offline. En perfil local es "Exit local
              mode". logout() no necesita red, así que funciona sin conexión. */}
          <Pressable
            style={({ pressed }) => [styles.offlinePill, pressed && { opacity: 0.6 }]}
            onPress={() => logout()}
          >
            <Ionicons name="log-out-outline" size={18} color="#000" />
            <Text style={styles.offlinePillText}>
              {offline && !auth ? t('Exit local mode') : t('Sign out')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Dialog
        visible={confirmReset}
        title={t('Restore default settings')}
        message={t('Your preferences will go back to their defaults. Your language stays.')}
        confirmLabel={t('Restore')}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetToDefaults();
          toast(t('Settings restored'));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Mismo avatar que la cabecera de Inicio (anillo de acento) por coherencia.
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  profileName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
  },
  sectionRowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1 },
  // Fila con las acciones de sesión (offline manual + salir), centradas.
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  // Pastilla sólida clara para las acciones de sesión (cambio de modo y cerrar
  // sesión): fondo blanco con texto e iconos negros, para que destaquen.
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  offlinePillText: { color: '#000', fontSize: fontSize.sm, fontWeight: '600' },
});
