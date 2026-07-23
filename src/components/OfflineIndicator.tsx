/**
 * Subtle "offline" indicator for headers (Library, Search…).
 * Outside Home, it reminds why content is limited to downloads.
 * Only for server accounts in offline mode; on a local profile "offline" is
 * the normal state and doesn't need a warning. Home doesn't use it: it already
 * has its banner.
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
  // Just dim icon + text, no background: present but not attention-grabbing, and
  // consistent on any surface (header or search bar).
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
});
