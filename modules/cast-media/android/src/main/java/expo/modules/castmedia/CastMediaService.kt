package expo.modules.castmedia

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.VolumeProviderCompat
import androidx.media.app.NotificationCompat.MediaStyle
import java.net.HttpURLConnection
import java.net.URL

/**
 * Servicio foreground que mantiene una MediaSessionCompat viva mientras se
 * castea por UPnP. Da los controles de bloqueo/notificación (Issue 3) y, al
 * declarar la sesión como reproducción remota con un VolumeProviderCompat, hace
 * que los botones físicos de volumen controlen el stream (Issue 1). Los comandos
 * (play/pausa/anterior/siguiente/seek/volumen) se reenvían a JS vía
 * `CastMediaModule`, que ya sabe enrutarlos al renderer. No reproduce audio.
 */
class CastMediaService : Service() {
  data class Info(
    val title: String?,
    val artist: String?,
    val album: String?,
    val artworkUrl: String?,
    val durationMs: Long,
    val positionMs: Long,
    val isPlaying: Boolean,
  )

  private var session: MediaSessionCompat? = null
  private var info: Info = Info(null, null, null, null, 0, 0, false)
  private val mainHandler = Handler(Looper.getMainLooper())

  private var lastArtUrl: String? = null
  private var artBitmap: Bitmap? = null

  private val volumeProvider =
    object : VolumeProviderCompat(
      VolumeProviderCompat.VOLUME_CONTROL_RELATIVE,
      MAX_VOLUME,
      MAX_VOLUME / 2,
    ) {
      override fun onAdjustVolume(direction: Int) {
        // direction: +1 subir, -1 bajar, 0 (mute toggle) lo ignoramos.
        if (direction == 0) return
        // Optimista: mueve el overlay del sistema en el acto (antes era fijo a
        // 50% porque currentVolume nunca se tocaba). JS reenvía el valor exacto
        // por setVolumeLevel tras aplicarlo en el renderer.
        currentVolume = (currentVolume + direction).coerceIn(0, MAX_VOLUME)
        CastMediaModule.instance?.emitCommand("volume", direction.toDouble())
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    ensureChannel()
    val s = MediaSessionCompat(this, "ResonusCast")
    s.setFlags(
      MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
        MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS,
    )
    s.setCallback(SessionCallback())
    // Reproducción remota: enruta los botones físicos de volumen al provider.
    s.setPlaybackToRemote(volumeProvider)
    s.isActive = true
    session = s
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        bootInfo?.let { info = it }
        bootInfo = null
        startForegroundWithNotification()
        applyMetadata()
        applyPlaybackState()
        loadArtwork()
      }
      ACTION_PLAY -> CastMediaModule.instance?.emitCommand("play", null)
      ACTION_PAUSE -> CastMediaModule.instance?.emitCommand("pause", null)
      ACTION_NEXT -> CastMediaModule.instance?.emitCommand("next", null)
      ACTION_PREV -> CastMediaModule.instance?.emitCommand("previous", null)
      ACTION_STOP -> {
        CastMediaModule.instance?.emitCommand("stop", null)
        stopEverything()
      }
      else -> {
        // Reinicio del sistema sin datos: no dejamos un servicio zombie.
        if (session == null) stopSelf(startId)
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    session?.run {
      isActive = false
      release()
    }
    session = null
    super.onDestroy()
  }

  /** Refresca metadatos + estado (cambio de pista). Corre en el hilo main. */
  fun update(next: Info) = mainHandler.post {
    val artChanged = next.artworkUrl != info.artworkUrl
    info = next
    if (artChanged) {
      artBitmap = null
      lastArtUrl = null
    }
    applyMetadata()
    applyPlaybackState()
    renotify()
    if (artChanged) loadArtwork()
  }

  /** Refresca solo estado de reproducción (play/pausa/progreso). */
  fun setState(isPlaying: Boolean, positionMs: Long) = mainHandler.post {
    val playingChanged = isPlaying != info.isPlaying
    info = info.copy(isPlaying = isPlaying, positionMs = positionMs)
    applyPlaybackState()
    // El scrubber del bloqueo lo lee del PlaybackState de la sesión; solo hay
    // que rehacer la notificación cuando cambia el botón play/pausa (no cada
    // segundo por el progreso).
    if (playingChanged) renotify()
  }

  /**
   * Fija el volumen que muestra el overlay del sistema (fracción 0..1 desde JS).
   * Sin esto el provider se quedaba clavado en 50% aunque el volumen real
   * cambiara en el renderer.
   */
  fun setVolumeLevel(fraction: Double) = mainHandler.post {
    volumeProvider.currentVolume = (fraction * MAX_VOLUME).toInt().coerceIn(0, MAX_VOLUME)
  }

  fun stopEverything() = mainHandler.post {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun applyMetadata() {
    val meta = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, info.title ?: "")
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, info.artist ?: "")
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, info.album ?: "")
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, info.durationMs.coerceAtLeast(0))
    artBitmap?.let { meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
    session?.setMetadata(meta.build())
  }

  private fun applyPlaybackState() {
    val state = if (info.isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    val ps = PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_PLAY_PAUSE or
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
          PlaybackStateCompat.ACTION_SEEK_TO or
          PlaybackStateCompat.ACTION_STOP,
      )
      .setState(state, info.positionMs.coerceAtLeast(0), 1f, SystemClock.elapsedRealtime())
      .build()
    session?.setPlaybackState(ps)
  }

  private fun startForegroundWithNotification() {
    val notif = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun renotify() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIF_ID, buildNotification())
  }

  private fun buildNotification(): Notification {
    val token = session?.sessionToken
    val playPauseAction = if (info.isPlaying) {
      NotificationCompat.Action(
        android.R.drawable.ic_media_pause,
        "Pause",
        servicePendingIntent(ACTION_PAUSE),
      )
    } else {
      NotificationCompat.Action(
        android.R.drawable.ic_media_play,
        "Play",
        servicePendingIntent(ACTION_PLAY),
      )
    }
    val style = MediaStyle().setShowActionsInCompactView(0, 1, 2)
    if (token != null) style.setMediaSession(token)

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(info.title ?: "")
      .setContentText(info.artist ?: "")
      .setOnlyAlertOnce(true)
      // Persistente mientras dura la sesión de cast: se retira al desconectar,
      // no al deslizarla (evita dejar el servicio foreground huérfano).
      .setOngoing(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(contentPendingIntent())
      .addAction(
        android.R.drawable.ic_media_previous,
        "Previous",
        servicePendingIntent(ACTION_PREV),
      )
      .addAction(playPauseAction)
      .addAction(
        android.R.drawable.ic_media_next,
        "Next",
        servicePendingIntent(ACTION_NEXT),
      )
      .setStyle(style)
    artBitmap?.let { builder.setLargeIcon(it) }
    return builder.build()
  }

  private fun servicePendingIntent(action: String): PendingIntent {
    val intent = Intent(this, CastMediaService::class.java).setAction(action)
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
    return PendingIntent.getService(this, action.hashCode(), intent, flags)
  }

  private fun contentPendingIntent(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
    return PendingIntent.getActivity(this, 0, launch, flags)
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Casting", NotificationManager.IMPORTANCE_LOW).apply {
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    nm.createNotificationChannel(channel)
  }

  /** Baja la carátula (best-effort) en un hilo aparte y la aplica al volver. */
  private fun loadArtwork() {
    val url = info.artworkUrl ?: return
    if (url == lastArtUrl && artBitmap != null) return
    lastArtUrl = url
    Thread {
      val bmp = runCatching {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.doInput = true
        conn.connect()
        conn.inputStream.use { BitmapFactory.decodeStream(it) }
      }.getOrNull() ?: return@Thread
      mainHandler.post {
        // La pista pudo cambiar mientras bajaba: solo aplica si sigue vigente.
        if (url != info.artworkUrl) return@post
        artBitmap = bmp
        applyMetadata()
        renotify()
      }
    }.start()
  }

  private inner class SessionCallback : MediaSessionCompat.Callback() {
    /**
     * Algunos mandos Bluetooth/AVRCP mandan el comando como KeyEvent crudo
     * (KEYCODE_MEDIA_NEXT/PREVIOUS) que el callback por defecto no siempre
     * traduce a onSkipToNext/Previous — de ahí que el skip no funcionara aunque
     * play/pausa sí. Lo enrutamos explícitamente. Solo ACTION_DOWN para no
     * disparar dos veces (down + up).
     */
    override fun onMediaButtonEvent(mediaButtonEvent: Intent): Boolean {
      val ke: KeyEvent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
        } else {
          @Suppress("DEPRECATION")
          mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
        }
      if (ke != null && ke.action == KeyEvent.ACTION_DOWN) {
        when (ke.keyCode) {
          KeyEvent.KEYCODE_MEDIA_NEXT -> { onSkipToNext(); return true }
          KeyEvent.KEYCODE_MEDIA_PREVIOUS -> { onSkipToPrevious(); return true }
          KeyEvent.KEYCODE_MEDIA_PLAY -> { onPlay(); return true }
          KeyEvent.KEYCODE_MEDIA_PAUSE -> { onPause(); return true }
          KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
          KeyEvent.KEYCODE_HEADSETHOOK -> {
            if (info.isPlaying) onPause() else onPlay()
            return true
          }
          KeyEvent.KEYCODE_MEDIA_STOP -> { onStop(); return true }
        }
      }
      return super.onMediaButtonEvent(mediaButtonEvent)
    }

    override fun onPlay() {
      CastMediaModule.instance?.emitCommand("play", null)
    }

    override fun onPause() {
      CastMediaModule.instance?.emitCommand("pause", null)
    }

    override fun onSkipToNext() {
      CastMediaModule.instance?.emitCommand("next", null)
    }

    override fun onSkipToPrevious() {
      CastMediaModule.instance?.emitCommand("previous", null)
    }

    override fun onSeekTo(pos: Long) {
      CastMediaModule.instance?.emitCommand("seek", pos.toDouble())
    }

    override fun onStop() {
      CastMediaModule.instance?.emitCommand("stop", null)
      stopEverything()
    }
  }

  companion object {
    const val ACTION_START = "expo.modules.castmedia.START"
    const val ACTION_STOP = "expo.modules.castmedia.STOP"
    const val ACTION_PLAY = "expo.modules.castmedia.PLAY"
    const val ACTION_PAUSE = "expo.modules.castmedia.PAUSE"
    const val ACTION_NEXT = "expo.modules.castmedia.NEXT"
    const val ACTION_PREV = "expo.modules.castmedia.PREV"

    private const val CHANNEL_ID = "resonus_cast"
    private const val NOTIF_ID = 4711
    private const val MAX_VOLUME = 20

    @Volatile var instance: CastMediaService? = null
      private set

    /** Estado inicial que el módulo deja antes de arrancar el servicio. */
    @Volatile var bootInfo: Info? = null
  }
}
