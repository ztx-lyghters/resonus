/**
 * Piezas compartidas por la pantalla de Ajustes y sus sub-pantallas: filas
 * dentro de cajas redondeadas (surface sobre el fondo, más legibles), con la
 * descripción gris dentro de la fila, switch a la derecha y selectores que
 * abren un menú flotante compacto.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/store/settings';
import { colors, fontSize, radius, spacing, SCREEN_BOTTOM_PADDING } from '@/theme';

/**
 * Acento vivo, leído del store en vez de la constante global.
 *
 * `colors.accent` se muta al elegir otro acento, pero eso no repinta nada por
 * sí solo: las pantallas de Ajustes que quedan montadas debajo del selector no
 * se enteran y siguen enseñando el color anterior hasta salir y volver a
 * entrar. Suscribiéndose aquí se repintan todas a la vez.
 */
function useAccent(): string {
  return useSettings((s) => s.accentColor);
}

/** Cabecera con flecha de volver y título centrado. */
export function ScreenHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View style={settingsStyles.header}>
      <Pressable hitSlop={12} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </Pressable>
      <Text style={settingsStyles.headerTitle}>{title}</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

/** Contenedor de pantalla de ajustes (safe-area + cabecera). */
export function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={settingsStyles.safe} edges={['top']}>
      <ScreenHeader title={title} />
      {children}
    </SafeAreaView>
  );
}

/**
 * Fila plana de ajustes: etiqueta blanca, descripción gris debajo y lo que
 * toque a la derecha (chevron con `onPress`, texto en `right`, o ambos).
 */
export function SettingRow({
  label,
  description,
  icon,
  right,
  chevron,
  destructive,
  onPress,
}: {
  label: string;
  description?: string;
  /**
   * Icono a la izquierda: lo llevan las filas de ACCIÓN (escanear, limpiar…)
   * para distinguirse a simple vista de los datos de solo lectura.
   */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Texto gris a la derecha (valor actual, "Próximamente"…). */
  right?: string;
  /** Flecha a la derecha: solo para filas que navegan a otra pantalla. */
  chevron?: boolean;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      {icon ? (
        <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.text} />
      ) : null}
      <View style={settingsStyles.rowLabelBox}>
        <Text style={[settingsStyles.rowLabel, destructive && { color: colors.danger }]}>
          {label}
        </Text>
        {description ? <Text style={settingsStyles.rowDescription}>{description}</Text> : null}
      </View>
      {right ? <Text style={settingsStyles.rowValue}>{right}</Text> : null}
      {chevron ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
    </>
  );
  if (!onPress) {
    return <View style={[settingsStyles.cardBox, settingsStyles.row]}>{body}</View>;
  }
  return (
    <Pressable
      style={({ pressed }) => [
        settingsStyles.cardBox,
        settingsStyles.row,
        pressed && { opacity: 0.6 },
      ]}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

/** Alto aproximado de cada opción del menú flotante (para calcular si cabe). */
const MENU_ITEM_H = 42;

/**
 * Selector "elige una" compacto: una sola fila con el valor actual ("Calidad
 * de streaming · Original ⌄") que al tocarla abre un menú flotante pequeño
 * anclado a la derecha (estilo dropdown de Android) con las opciones; elegir
 * lo cierra. Con `collapsible: false` se pinta como lista de radios siempre a
 * la vista (p. ej. la pantalla de Idioma). Las etiquetas llegan ya traducidas
 * desde quien lo usa.
 */
export function SelectList<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  description,
  collapsible = true,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  description?: string;
  collapsible?: boolean;
}) {
  const accent = useAccent();
  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  // Posición de la fila en pantalla (medida al abrir) y alto natural del menú
  // (medido al pintarse): con ambos se ancla exacto, pegado a la fila.
  const [anchor, setAnchor] = useState<{ y: number; h: number } | null>(null);
  const [menuH, setMenuH] = useState(0);
  const rowRef = useRef<View>(null);
  const active = options.find((o) => o.value === value) ?? options[0];

  function openMenu() {
    // `measureInWindow` mide desde el contenido de la ventana, es decir BAJO la
    // barra de estado, mientras que el Modal pinta a pantalla completa, desde
    // arriba del todo. Son dos orígenes separados justo `insets.top`, y no
    // sumarlo dejaba el menú esa distancia demasiado alto. Se convierte aquí,
    // una sola vez, para que el resto del cálculo viva entero en coordenadas de
    // pantalla (que es en las que va `frame`).
    rowRef.current?.measureInWindow((_x, y, _w, h) => setAnchor({ y: y + insets.top, h }));
  }

  /**
   * Sitúa el menú pegado a la fila: debajo si cabe y, si no, encima.
   *
   * Todo va en coordenadas de pantalla (las del Modal y las de `frame`); la
   * `y` de la fila ya llega convertida desde `openMenu`. Los límites salen del
   * frame de safe-area y no de `Dimensions.get('window')`, que es de otro
   * espacio y hacía saltar el "no cabe" antes de tiempo.
   *
   * Devuelve también el hueco del lado elegido como tope de altura: con el menú
   * limitado (y con scroll) siempre existe una posición pegada a la fila, así
   * que nunca hay que despegarlo al borde de la pantalla.
   */
  function menuLayout(a: { y: number; h: number }, mh: number): { top: number; maxHeight: number } {
    const limitTop = insets.top + spacing.sm;
    const limitBottom = frame.height - insets.bottom - spacing.sm;
    const belowTop = a.y + a.h - spacing.xs; // pegado bajo la fila
    const aboveBottom = a.y + spacing.xs; // pegado sobre la fila
    const roomBelow = limitBottom - belowTop;
    const roomAbove = aboveBottom - limitTop;
    // Abajo si cabe; si no, arriba si cabe; si no cabe en ninguno, el lado con
    // más hueco (el scroll se encarga del resto).
    const useBelow = mh <= roomBelow || (mh > roomAbove && roomBelow >= roomAbove);
    if (useBelow) return { top: belowTop, maxHeight: Math.max(0, roomBelow) };
    return { top: aboveBottom - Math.min(mh, roomAbove), maxHeight: Math.max(0, roomAbove) };
  }

  if (!collapsible) {
    return (
      <View style={settingsStyles.cardBox}>
        {options.map((opt, i) => {
          const isActive = opt.value === value;
          return (
            <Pressable
              key={String(opt.value)}
              style={({ pressed }) => [
                settingsStyles.row,
                i > 0 && settingsStyles.rowBorder,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => {
                if (!isActive) onChange(opt.value);
              }}
            >
              <Text style={[settingsStyles.rowLabel, { flex: 1 }]}>{opt.label}</Text>
              <Ionicons
                name={isActive ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={isActive ? accent : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  const menu = anchor != null ? menuLayout(anchor, menuH) : null;

  return (
    <>
      <Pressable
        ref={rowRef}
        accessibilityRole="button"
        style={({ pressed }) => [
          settingsStyles.cardBox,
          settingsStyles.row,
          pressed && { opacity: 0.6 },
        ]}
        onPress={openMenu}
      >
        <View style={settingsStyles.rowLabelBox}>
          <Text style={settingsStyles.rowLabel}>{label ?? active?.label}</Text>
          {description ? <Text style={settingsStyles.rowDescription}>{description}</Text> : null}
        </View>
        {label ? <Text style={settingsStyles.rowValue}>{active?.label}</Text> : null}
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      {/* `statusBarTranslucent` deja el Modal a pantalla completa, que es el
          espacio en el que está hecha la cuenta de `menuLayout` (el mismo que
          mide `useSafeAreaFrame`). */}
      <Modal
        transparent
        statusBarTranslucent
        animationType="fade"
        visible={anchor != null}
        onRequestClose={() => setAnchor(null)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
        {menu != null ? (
          <View
            // Invisible el primer frame (aún sin alto medido): evita verlo
            // saltar de sitio cuando abre hacia arriba.
            style={[
              settingsStyles.menu,
              { top: menu.top, maxHeight: menu.maxHeight, opacity: menuH > 0 ? 1 : 0 },
            ]}
          >
            <ScrollView
              // El alto se mide aquí y no con `onLayout` del menú: al llevar
              // tope, `onLayout` devolvería el alto ya recortado y se
              // realimentaría. El tamaño del contenido es el natural, que es lo
              // que hay que comparar con el hueco. Se le suma el relleno del
              // menú, que queda fuera del ScrollView.
              onContentSizeChange={(_w, h) => setMenuH(h + spacing.sm * 2)}
              // Solo hace scroll si el menú no cabe entero; si cabe, ni se nota.
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    style={({ pressed }) => [settingsStyles.menuItem, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      setAnchor(null);
                      if (!isActive) onChange(opt.value);
                    }}
                  >
                    <Text style={[settingsStyles.menuItemText, isActive && { color: accent }]}>
                      {opt.label}
                    </Text>
                    {isActive ? <Ionicons name="checkmark" size={18} color={accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * Fila con slider debajo (estilo crossfade de Spotify): etiqueta y valor
 * actual arriba, barra deslizante debajo. El valor mostrado sigue al dedo
 * mientras se arrastra; el cambio se aplica al soltar.
 */
export function SliderRow({
  label,
  description,
  value,
  min = 0,
  max,
  step = 1,
  formatValue,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  /** Texto del valor actual (llega ya traducido desde quien lo usa). */
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const accent = useAccent();
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  return (
    <View style={settingsStyles.cardBox}>
      <View style={[settingsStyles.row, { paddingBottom: 0 }]}>
        <View style={settingsStyles.rowLabelBox}>
          <Text style={settingsStyles.rowLabel}>{label}</Text>
          {description ? <Text style={settingsStyles.rowDescription}>{description}</Text> : null}
        </View>
        <Text style={settingsStyles.rowValue}>{formatValue(shown)}</Text>
      </View>
      <Slider
        style={settingsStyles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={setLive}
        onSlidingComplete={(v) => {
          setLive(null);
          onChange(v);
        }}
        minimumTrackTintColor={accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.text}
      />
    </View>
  );
}

/** Grupo de interruptores, uno por fila, con su ayuda dentro de la fila. */
export function SwitchList({
  options,
}: {
  options: {
    label: string;
    description?: string;
    value: boolean;
    onChange: (value: boolean) => void;
  }[];
}) {
  const accent = useAccent();
  return (
    <View style={settingsStyles.cardBox}>
      {options.map((opt, i) => (
        <View key={opt.label} style={[settingsStyles.row, i > 0 && settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowLabelBox}>
            <Text style={settingsStyles.rowLabel}>{opt.label}</Text>
            {opt.description ? (
              <Text style={settingsStyles.rowDescription}>{opt.description}</Text>
            ) : null}
          </View>
          <Switch
            value={opt.value}
            onValueChange={opt.onChange}
            trackColor={{ false: colors.border, true: accent }}
            thumbColor={colors.text}
          />
        </View>
      ))}
    </View>
  );
}

/** Pareja etiqueta/valor para datos de solo lectura. */
/**
 * Fila con un campo de texto editable. El contador de caracteres solo aparece
 * cerca del tope: mientras sobra sitio no es información, es ruido.
 */
export function TextRow({
  label,
  description,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  onChange: (v: string) => void;
}) {
  const accent = useAccent();
  const near = value.length >= maxLength - 3;
  return (
    <View style={[settingsStyles.cardBox, settingsStyles.textRow]}>
      <View style={settingsStyles.textRowTop}>
        <View style={settingsStyles.rowLabelBox}>
          <Text style={settingsStyles.rowLabel}>{label}</Text>
          {description ? <Text style={settingsStyles.rowDescription}>{description}</Text> : null}
        </View>
        {near ? (
          <Text style={[settingsStyles.rowValue, { color: accent }]}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <TextInput
        style={settingsStyles.textInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={[settingsStyles.cardBox, settingsStyles.field]}>
      <Text style={settingsStyles.fieldLabel}>{label}</Text>
      <Text style={settingsStyles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export const settingsStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: SCREEN_BOTTOM_PADDING },
  // Título de grupo estilo Spotify: negrita clara, con aire por encima.
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  // Caja redondeada sobre el fondo (las filas viven dentro, más legibles).
  cardBox: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { color: colors.text, fontSize: fontSize.md },
  rowLabelBox: { flex: 1 },
  rowDescription: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  rowValue: { color: colors.textSecondary, fontSize: fontSize.sm },
  textRow: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.sm },
  textRowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  textInput: {
    color: colors.text,
    fontSize: fontSize.md,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  slider: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    height: 32,
  },
  // Menú flotante anclado a la derecha (estilo dropdown de Android).
  menu: {
    position: 'absolute',
    right: spacing.lg,
    minWidth: 170,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    height: MENU_ITEM_H,
  },
  menuItemText: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  field: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  fieldLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: 2 },
  fieldValue: { color: colors.text, fontSize: fontSize.md },
  // Botón píldora blanco centrado (el "Cerrar sesión" de Spotify).
  pillButton: {
    alignSelf: 'center',
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl + spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  pillButtonText: { color: '#000', fontSize: fontSize.md, fontWeight: '700' },
});
