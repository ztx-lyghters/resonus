/**
 * Indicador sutil de "sin conexión" para las cabeceras (Biblioteca, Buscar…).
 * Recuerda, fuera de Inicio, por qué el contenido está limitado a lo descargado.
 * Solo con cuenta de servidor en modo offline; en un perfil local "offline" es
 * el estado normal y no hace falta avisar. Inicio no lo usa: ya tiene su banner.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { colors, fontSize, spacing } from '@/theme';

export function OfflineIndicator() {
  const t = useT();
  const offline = useAuthStore((s) => s.offline);
  const hasAccount = useAuthStore((s) => !!s.auth);
  if (!offline || !hasAccount) return null;
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={t('Offline')}>
      <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
      <Text style={styles.text}>{t('Offline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Solo icono + texto apagados, sin fondo: presente pero sin robar atención, y
  // coherente sobre cualquier superficie (cabecera o barra de búsqueda).
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
});
