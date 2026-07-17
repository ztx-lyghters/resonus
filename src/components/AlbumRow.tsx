/**
 * Fila de álbum para los listados: carátula pequeña, nombre y artista. La
 * hermana de `AlbumCard` para el modo lista; hasta ahora solo existía suelta
 * dentro de la Biblioteca.
 *
 * La chincheta es opcional porque anclar es cosa de la Biblioteca: al explorar
 * no hay nada anclado que enseñar.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { coverArtUrl, type Album } from '@/api/data';
import { haptic } from '@/lib/haptics';
import { useMediaMenu } from '@/store/mediaMenu';
import { useSettings } from '@/store/settings';
import { colors, fontSize, spacing } from '@/theme';
import { Cover } from './Cover';

interface Props {
  album: Album;
  /** Marca el álbum como anclado con una chincheta junto al artista. */
  pinned?: boolean;
}

export function AlbumRow({ album, pinned }: Props) {
  const openMenu = useMediaMenu((s) => s.open);
  // Del store, no de `colors.accent`: sin suscripción la chincheta se quedaría
  // con el acento anterior mientras la pantalla siga montada.
  const accent = useSettings((s) => s.accentColor);

  return (
    <Link href={`/album/${album.id}`} asChild>
      <Pressable
        style={styles.row}
        onLongPress={() => {
          haptic('light');
          openMenu({ kind: 'album', album });
        }}
      >
        <Cover uri={coverArtUrl(album.coverArt ?? album.id, 100)} size={56} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {album.name}
          </Text>
          {album.artist || pinned ? (
            <View style={styles.subLine}>
              {pinned ? (
                <MaterialCommunityIcons name="pin" size={13} color={accent} style={styles.pin} />
              ) : null}
              {album.artist ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {album.artist}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  subLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sub: { color: colors.textSecondary, fontSize: fontSize.xs },
  // La chincheta de MCI viene vertical; girada 45° queda como la de Spotify.
  pin: { transform: [{ rotate: '45deg' }] },
});
