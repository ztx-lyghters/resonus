/** Square cover art with placeholder when no image. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, type ImageStyle } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

interface Props {
  uri?: string;
  size: number;
  rounded?: boolean;
  /** Fade when loading/switching the image (ms). 0 for instant changes. */
  transition?: number;
  /** Placeholder icon when no image (e.g. radio). */
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
  // If the image fails to load (e.g. offline without cache or download), we fall
  // back to the placeholder instead of leaving a gap. Reset on `uri` change
  // because lists recycle the same instance with a different song.
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
