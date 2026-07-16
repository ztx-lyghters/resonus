/**
 * Tarjeta de artista para las cuadrículas y carruseles: foto redonda con el
 * nombre debajo, centrado. El gemelo de `AlbumCard`, que ya existía; los
 * artistas se pintaban a mano en cada pantalla.
 */
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { coverArtUrl, type Artist } from '@/api/data';
import { colors, fontSize, spacing } from '@/theme';
import { Cover } from './Cover';

interface Props {
  artist: Artist;
  width?: number;
}

export function ArtistCard({ artist, width = 150 }: Props) {
  const cover = coverArtUrl(artist.coverArt ?? artist.id, 300);

  return (
    <Link href={`/artist/${artist.id}`} asChild>
      {/* expo-router fusiona el estilo del Link en este hijo; debe ser un
          único objeto, no un array, así que lo aplanamos. */}
      <Pressable style={StyleSheet.flatten([styles.container, { width }])}>
        <Cover uri={cover} size={width} rounded />
        <Text style={styles.name} numberOfLines={1}>
          {artist.name}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, alignItems: 'center' },
  name: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
