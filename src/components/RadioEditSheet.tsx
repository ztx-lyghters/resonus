/** Hoja para crear o editar una emisora de radio: nombre, URL y web opcional. */
import { useEffect, useState } from 'react';
import {
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

import { useT } from '@/i18n';
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
  onCancel: () => void;
  onSave: (changes: RadioEdit) => void;
}

export function RadioEditSheet({ visible, initial, editing, onCancel, onSave }: Props) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [streamUrl, setStreamUrl] = useState(initial.streamUrl);
  const [homePageUrl, setHomePageUrl] = useState(initial.homePageUrl);

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
