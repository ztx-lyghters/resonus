/** Hoja para crear o editar una emisora de radio: nombre, URL y web opcional. */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Cover } from '@/components/Cover';
import { useT } from '@/i18n';
import { useRadioCovers } from '@/store/radioCovers';
import { colors, fontSize, radius, spacing } from '@/theme';

export interface RadioEdit {
  name: string;
  streamUrl: string;
  homePageUrl: string;
}

interface Props {
  visible: boolean;
  /** Valores iniciales (para editar); vacíos para crear. */
  initial: RadioEdit;
  /** true si se está editando una emisora existente (cambia el título). */
  editing: boolean;
  /**
   * Id de la emisora en el servidor: habilita ponerle una carátula propia
   * (copiada al dispositivo). Solo al editar; al crear aún no hay id.
   */
  coverId?: string;
  onCancel: () => void;
  onSave: (changes: RadioEdit) => void;
}

export function RadioEditSheet({ visible, initial, editing, coverId, onCancel, onSave }: Props) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [streamUrl, setStreamUrl] = useState(initial.streamUrl);
  const [homePageUrl, setHomePageUrl] = useState(initial.homePageUrl);

  // Carátula local (se guarda en el acto al elegir/quitar, independiente de
  // Guardar; misma idea que la hoja de edición de playlist).
  const coverUri = useRadioCovers((s) => (coverId ? s.covers[coverId] : undefined));
  const setCover = useRadioCovers((s) => s.setCover);
  const removeCover = useRadioCovers((s) => s.removeCover);
  const [coverBusy, setCoverBusy] = useState(false);

  async function pickCover() {
    if (!coverId) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    setCoverBusy(true);
    try {
      await setCover(coverId, asset.uri);
    } finally {
      setCoverBusy(false);
    }
  }

  async function clearCover() {
    if (!coverId) return;
    setCoverBusy(true);
    try {
      await removeCover(coverId);
    } finally {
      setCoverBusy(false);
    }
  }

  // Reinicia los campos cada vez que se abre.
  useEffect(() => {
    if (visible) {
      setName(initial.name);
      setStreamUrl(initial.streamUrl);
      setHomePageUrl(initial.homePageUrl);
    }
  }, [visible, initial.name, initial.streamUrl, initial.homePageUrl]);

  const urlOk = /^https?:\/\//i.test(streamUrl.trim());
  const showUrlError = streamUrl.trim().length > 0 && !urlOk;
  const canSave = name.trim().length > 0 && urlOk;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={onCancel}>
            <Text style={[styles.headerAction, { color: colors.accent }]}>{t('Cancel')}</Text>
          </Pressable>
          <Text style={styles.title}>{editing ? t('Edit station') : t('Add station')}</Text>
          <Pressable
            hitSlop={12}
            disabled={!canSave}
            onPress={() =>
              onSave({
                name: name.trim(),
                streamUrl: streamUrl.trim(),
                homePageUrl: homePageUrl.trim(),
              })
            }
          >
            <Text
              style={[styles.headerAction, { color: colors.accent }, !canSave && styles.disabled]}
            >
              {t('Save')}
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {coverId ? (
              <View style={styles.coverWrap}>
                <Pressable
                  onPress={() => void pickCover()}
                  disabled={coverBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t('Change cover')}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <Cover uri={coverUri} size={160} placeholderIcon="radio" />
                  {coverBusy ? (
                    <View style={styles.coverOverlay}>
                      <ActivityIndicator color={colors.text} />
                    </View>
                  ) : (
                    <View style={styles.coverBadges}>
                      <View style={styles.coverBadge}>
                        <Ionicons name="camera" size={16} color={colors.text} />
                      </View>
                      {coverUri ? (
                        <Pressable
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={t('Remove cover')}
                          onPress={() => void clearCover()}
                          style={({ pressed }) => [styles.coverBadge, pressed && { opacity: 0.7 }]}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.text} />
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.label}>{t('Name')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('Station name')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <Text style={styles.label}>{t('Stream URL')}</Text>
            <TextInput
              style={styles.input}
              value={streamUrl}
              onChangeText={setStreamUrl}
              placeholder="https://…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
            />
            {showUrlError ? (
              <Text style={styles.error}>
                {t('The stream URL must start with http:// or https://')}
              </Text>
            ) : null}

            <Text style={styles.label}>{t('Website (optional)')}</Text>
            <TextInput
              style={styles.input}
              value={homePageUrl}
              onChangeText={setHomePageUrl}
              placeholder="https://…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  headerAction: { color: colors.accent, fontSize: fontSize.md, fontWeight: '600' },
  disabled: { color: colors.textMuted },
  content: { padding: spacing.lg, gap: spacing.sm },
  coverWrap: { alignItems: 'center', marginBottom: spacing.sm },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.md,
  },
  coverBadges: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  coverBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.pill,
    padding: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceHighlight,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.xs },
});
