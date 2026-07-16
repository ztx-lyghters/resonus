/**
 * Ajustes › Red: varias URLs para el mismo servidor/cuenta (IP local, dominio,
 * Tailscale…) y conmutación automática entre ellas al cambiar de red. La app
 * usa la primera que responde, probando las de red local primero (en casa gana
 * la local; fuera cae sola a la remota). Solo aplica a perfiles de servidor.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Dialog } from '@/components/Dialog';
import { SettingsPage, settingsStyles, SwitchList } from '@/components/SettingsUI';
import { reachable } from '@/api/backend';
import { isLanUrl } from '@/lib/serverUrls';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/auth';
import { checkAutoUrlNow } from '@/store/autoUrl';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { colors, fontSize, radius, spacing } from '@/theme';

/** Quita el esquema para mostrar la URL más compacta. */
function shown(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export default function NetworkSettings() {
  const t = useT();
  const toast = useToast((s) => s.show);
  const auth = useAuthStore((s) => s.auth);
  const setActiveUrl = useAuthStore((s) => s.setActiveUrl);
  const addServerUrl = useAuthStore((s) => s.addServerUrl);
  const removeServerUrl = useAuthStore((s) => s.removeServerUrl);
  const setAutoUrl = useAuthStore((s) => s.setAutoUrl);
  // Del store, no de `colors.accent`: sin suscripción el radio de la URL activa
  // y el «Añadir dirección» se quedarían con el acento anterior mientras la
  // pantalla siga montada.
  const accent = useSettings((s) => s.accentColor);

  const [health, setHealth] = useState<'checking' | 'ok' | 'down'>('checking');
  const [adding, setAdding] = useState(false);

  const activeUrl = auth?.serverUrl ?? '';

  // Comprueba si la URL activa responde ahora mismo (el check verde/rojo).
  useEffect(() => {
    if (!auth) return;
    let alive = true;
    setHealth('checking');
    reachable(auth, activeUrl).then((ok) => {
      if (alive) setHealth(ok ? 'ok' : 'down');
    });
    return () => {
      alive = false;
    };
  }, [auth, activeUrl]);

  if (!auth) {
    return <SettingsPage title={t('Network')}>{null}</SettingsPage>;
  }

  const urls = auth.urls ?? [activeUrl];
  const primary = urls[0];

  async function onAdd(value: string) {
    setAdding(false);
    const result = await addServerUrl(value);
    if (result === 'duplicate') toast(t('This address is already in the list.'));
    else if (result === 'unreachable') toast(t("Couldn't reach this address with your account."));
    else toast(t('Address added'));
  }

  return (
    <SettingsPage title={t('Network')}>
      <ScrollView contentContainerStyle={settingsStyles.content}>
        <Text style={[settingsStyles.sectionTitle, { marginTop: 0 }]}>
          {t('Current server address')}
        </Text>
        <View style={[settingsStyles.cardBox, styles.activeRow]}>
          {health === 'checking' ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Ionicons
              name={health === 'ok' ? 'checkmark-circle' : 'alert-circle'}
              size={22}
              color={health === 'ok' ? colors.success : colors.danger}
            />
          )}
          <Text style={styles.activeUrl} numberOfLines={1}>
            {shown(activeUrl)}
          </Text>
        </View>

        <SwitchList
          options={[
            {
              label: t('Automatic URL switching'),
              description: t('Switches to your remote address automatically when you leave home.'),
              value: !!auth.autoUrl,
              onChange: (v) => {
                void setAutoUrl(v);
                if (v) checkAutoUrlNow();
              },
            },
          ]}
        />

        <Text style={settingsStyles.sectionTitle}>{t('Server addresses')}</Text>
        <Text style={settingsStyles.sectionDescription}>
          {t(
            'Add your remote address (a domain or Tailscale) next to the local one to reach the server away from home.',
          )}
        </Text>
        <View style={settingsStyles.cardBox}>
          {urls.map((url, i) => {
            const isActive = url === activeUrl;
            const isPrimary = url === primary;
            return (
              <Pressable
                key={url}
                style={({ pressed }) => [
                  settingsStyles.row,
                  i > 0 && settingsStyles.rowBorder,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => {
                  if (!isActive) void setActiveUrl(url);
                }}
              >
                <Ionicons
                  name={isActive ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={isActive ? accent : colors.textMuted}
                />
                <View style={settingsStyles.rowLabelBox}>
                  <Text style={settingsStyles.rowLabel} numberOfLines={1}>
                    {shown(url)}
                  </Text>
                  {/* Etiqueta autodetectada (Local/Remota) + «Principal» en la
                      primera: explica el modelo de un vistazo. */}
                  <Text style={settingsStyles.rowDescription}>
                    {isLanUrl(url) ? t('Local') : t('Remote')}
                    {isPrimary ? ` · ${t('Primary')}` : ''}
                  </Text>
                </View>
                {/* La principal es la identidad del perfil: no se borra. */}
                {!isPrimary ? (
                  <Pressable
                    hitSlop={10}
                    onPress={() => void removeServerUrl(url)}
                    style={({ pressed }) => pressed && { opacity: 0.6 }}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={({ pressed }) => [
            settingsStyles.cardBox,
            settingsStyles.row,
            styles.addRow,
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => setAdding(true)}
        >
          <Ionicons name="add" size={22} color={accent} />
          <Text style={[settingsStyles.rowLabel, { color: accent }]}>
            {t('Add address')}
          </Text>
        </Pressable>
      </ScrollView>

      <Dialog
        visible={adding}
        title={t('Add server address')}
        input={{ placeholder: 'https://…' }}
        confirmLabel={t('Add address')}
        onCancel={() => setAdding(false)}
        onConfirm={onAdd}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  activeUrl: { color: colors.text, fontSize: fontSize.md, flex: 1 },
  addRow: { marginTop: spacing.sm, borderRadius: radius.md },
});
