/** Carátula cuadrada con marcador de posición cuando no hay imagen. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, type ImageStyle } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

interface Props {
  uri?: string;
  size: number;
  rounded?: boolean;
  /** Fundido al cargar/cambiar la imagen (ms). 0 para cambios instantáneos. */
  transition?: number;
  /** Icono del marcador de posición cuando no hay imagen (p. ej. radio). */
  placeholderIcon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle | ImageStyle>;
}

export function Cover({
  uri,
  size,
  rounded,
  transition = 200,
  placeholderIcon = 'musical-notes',
  style,
}: Props) {
  // Si la imagen no carga (p. ej. offline sin caché ni descarga), caemos al
  // marcador de posición en vez de dejar un hueco. Se resetea al cambiar de
  // `uri` porque las listas reciclan la misma instancia con otra canción.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);
  const borderRadius = rounded ? size / 2 : radius.md;
  if (!uri || failed) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: colors.surfaceHighlight,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style as StyleProp<ViewStyle>,
        ]}
      >
        <Ionicons name={placeholderIcon} size={size * 0.4} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size, borderRadius }, style as StyleProp<ImageStyle>]}
      contentFit="cover"
      transition={transition}
      recyclingKey={uri}
      onError={() => setFailed(true)}
    />
  );
}
