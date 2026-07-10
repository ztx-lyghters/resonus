/**
 * Cambiar/quitar la carátula de una playlist con una imagen del dispositivo.
 * Reúne las dos vías (API nativa de Navidrome ≥ 0.61 para perfiles de
 * servidor; copia local para el perfil sin conexión) y el diálogo de
 * contraseña de los perfiles antiguos que no la tienen guardada. Lo comparten
 * la hoja de edición de playlist y el visor de carátula.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { deletePlaylistImage, NavidromeError, uploadPlaylistImage } from '@/api/navidrome';
import { useT } from '@/i18n';
import { removeLocalPlaylistCover, setLocalPlaylistCover } from '@/lib/localQueries';
import { useAuthStore } from '@/store/auth';

type PickedImage = { uri: string; name: string; type: string };

/** Acción de carátula a la espera de la contraseña (perfiles antiguos). */
type CoverAction = { kind: 'upload'; image: PickedImage } | { kind: 'remove' };

export function usePlaylistCover({
  coverUploadId,
  localCoverId,
}: {
  /** Id en el servidor (solo perfiles Navidrome): sube vía su API nativa. */
  coverUploadId?: string;
  /** Id de lista del perfil local: copia la imagen al almacenamiento de la app. */
  localCoverId?: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const auth = useAuthStore((s) => s.auth);
  const saveNativePassword = useAuthStore((s) => s.saveNativePassword);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<CoverAction | null>(null);

  /** Vuelve al estado inicial (p. ej. al reabrir la hoja que lo usa).
   * Estable (useCallback) para poder ir en deps de efectos sin re-disparos. */
  const reset = useCallback(() => {
    setPickedUri(null);
    setError(null);
    setUploading(false);
    setAskPassword(false);
    setPendingAction(null);
  }, []);

  /** Abre la galería y, si se elige imagen, la sube/copia como carátula. */
  async function pickAndUpload() {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    await runAction({
      kind: 'upload',
      image: {
        uri: asset.uri,
        name: asset.fileName ?? 'cover.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      },
    });
  }

  async function removeCover() {
    await runAction({ kind: 'remove' });
  }

  async function runAction(action: CoverAction) {
    setError(null);
    if (localCoverId) {
      // Lista del perfil local: la carátula se copia/borra en el dispositivo.
      setUploading(true);
      try {
        if (action.kind === 'upload') {
          await setLocalPlaylistCover(localCoverId, action.image.uri);
          setPickedUri(action.image.uri);
        } else {
          await removeLocalPlaylistCover(localCoverId);
          setPickedUri(null);
        }
        void queryClient.invalidateQueries({ queryKey: ['playlist', localCoverId] });
        void queryClient.invalidateQueries({ queryKey: ['playlists'] });
      } catch {
        setError(t("Couldn't update the cover"));
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!coverUploadId || !auth) return;
    if (!auth.ndPassword) {
      // Perfil de antes de guardar la contraseña: pedirla una vez.
      setPendingAction(action);
      setAskPassword(true);
      return;
    }
    await doServerAction(action, auth);
  }

  async function doServerAction(action: CoverAction, authToUse: NonNullable<typeof auth>) {
    if (!coverUploadId) return;
    setUploading(true);
    try {
      if (action.kind === 'upload') {
        await uploadPlaylistImage(authToUse, coverUploadId, action.image);
        setPickedUri(action.image.uri);
      } else {
        await deletePlaylistImage(authToUse, coverUploadId);
        setPickedUri(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['playlist', coverUploadId] });
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    } catch (e) {
      if (e instanceof NavidromeError && e.kind === 'auth') {
        // Contraseña mala guardada: se olvida para volver a pedirla.
        void saveNativePassword('');
        setError(t('Wrong password'));
      } else if (e instanceof NavidromeError && e.kind === 'unsupported') {
        setError(t("Your server doesn't support playlist covers"));
      } else if (e instanceof NavidromeError && e.kind === 'forbidden') {
        setError(t('Artwork upload is disabled on the server'));
      } else {
        setError(t("Couldn't update the cover"));
      }
    } finally {
      setUploading(false);
    }
  }

  /** Respuesta del diálogo de contraseña: la guarda y reintenta la acción. */
  async function confirmPassword(password: string) {
    setAskPassword(false);
    const action = pendingAction;
    setPendingAction(null);
    if (!password || !action || !auth) return;
    await saveNativePassword(password);
    await doServerAction(action, { ...auth, ndPassword: password });
  }

  function cancelPassword() {
    setAskPassword(false);
    setPendingAction(null);
  }

  return {
    /** Hay alguna vía disponible para cambiar la carátula. */
    enabled: !!(coverUploadId || localCoverId),
    pickedUri,
    error,
    uploading,
    askPassword,
    pickAndUpload,
    removeCover,
    confirmPassword,
    cancelPassword,
    reset,
  };
}
