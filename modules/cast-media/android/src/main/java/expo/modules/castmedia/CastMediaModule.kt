package expo.modules.castmedia

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Puente Expo ↔ sesión de medios del casting. `start`/`update`/`setState`
 * empujan metadatos y estado al `CastMediaService` (que mantiene la notificación
 * y captura los botones de volumen), y los controles que el usuario pulsa
 * vuelven a JS por el evento "command". La API JS vive en `src/store/castMedia.ts`.
 */
class CastMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CastMedia")

    Events("command")

    OnCreate {
      instance = this@CastMediaModule
    }

    OnDestroy {
      if (instance === this@CastMediaModule) instance = null
    }

    /** Arranca la sesión con los metadatos + estado iniciales de la pista. */
    Function("start") { json: String ->
      val ctx = appContext.reactContext?.applicationContext ?: return@Function
      val info = parseInfo(json)
      val running = CastMediaService.instance
      if (running != null) {
        running.update(info)
        return@Function
      }
      startService(ctx, info)
    }

    /** Refresca metadatos + estado (cambio de pista). */
    Function("update") { json: String ->
      val info = parseInfo(json)
      val running = CastMediaService.instance
      if (running != null) {
        running.update(info)
      } else {
        // Aún no arrancó: reusa el flujo de start.
        val ctx = appContext.reactContext?.applicationContext ?: return@Function
        startService(ctx, info)
      }
    }

    /** Actualiza solo el estado de reproducción (play/pausa + progreso). */
    Function("setState") { isPlaying: Boolean, positionMs: Double ->
      CastMediaService.instance?.setState(isPlaying, positionMs.toLong())
    }

    /** Sincroniza el volumen que muestra el overlay del sistema (fracción 0..1). */
    Function("setVolumeLevel") { fraction: Double ->
      CastMediaService.instance?.setVolumeLevel(fraction)
    }

    /** Cierra la sesión y retira la notificación. */
    Function("stop") {
      CastMediaService.instance?.stopEverything()
    }
  }

  /** Reenvía a JS un control pulsado en la notificación/bloqueo o volumen. */
  fun emitCommand(action: String, value: Double?) {
    val payload = HashMap<String, Any>(2)
    payload["action"] = action
    if (value != null) payload["value"] = value
    sendEvent("command", payload)
  }

  companion object {
    @Volatile var instance: CastMediaModule? = null
      private set

    /**
     * Arranca el servicio foreground con el estado inicial. Envuelto en
     * runCatching: en Android 12+ arrancar un foreground service desde segundo
     * plano lanza excepción; el casting se inicia en primer plano, pero si el
     * SO lo bloquea preferimos tragarlo a que la app pete.
     */
    private fun startService(ctx: Context, info: CastMediaService.Info) {
      CastMediaService.bootInfo = info
      val intent = Intent(ctx, CastMediaService::class.java).setAction(CastMediaService.ACTION_START)
      runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          ctx.startForegroundService(intent)
        } else {
          ctx.startService(intent)
        }
      }
    }
  }
}

private fun parseInfo(json: String): CastMediaService.Info {
  val o = runCatching { JSONObject(json) }.getOrNull() ?: JSONObject()
  return CastMediaService.Info(
    title = o.optString("title").takeIf { it.isNotEmpty() },
    artist = o.optString("artist").takeIf { it.isNotEmpty() },
    album = o.optString("album").takeIf { it.isNotEmpty() },
    artworkUrl = o.optString("artworkUrl").takeIf { it.isNotEmpty() },
    durationMs = o.optLong("durationMs", 0L),
    positionMs = o.optLong("positionMs", 0L),
    isPlaying = o.optBoolean("isPlaying", false),
  )
}
