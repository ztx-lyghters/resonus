package expo.modules.audioeq

import android.content.Context
import android.media.AudioManager
import android.media.audiofx.Equalizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Ecualizador del sistema (android.media.audiofx.Equalizer) aplicado al audio
 * de la app. El procesado lo hace el framework de Android; aquí solo creamos el
 * efecto y le pasamos las ganancias.
 *
 * Un efecto por SESIÓN de audio: el reproductor usa dos ExoPlayer alternos (para
 * el crossfade), así que hay dos sesiones vivas y ambas deben ecualizarse igual.
 * El estado (activado + ganancias) vive aquí y se aplica a toda sesión que se
 * enganche, incluidas las que aparezcan después (al recrearse un player).
 */
class AudioEqModule : Module() {
  /** Efecto por id de sesión. */
  private val effects = mutableMapOf<Int, Equalizer>()
  private var enabled = false

  /** Ganancia por banda en milibelios; null = aún sin configurar (plano). */
  private var levels: ShortArray? = null

  /** Vuelca el estado actual sobre un efecto concreto. */
  private fun applyTo(eq: Equalizer) {
    runCatching {
      levels?.forEachIndexed { i, mb ->
        if (i < eq.numberOfBands) eq.setBandLevel(i.toShort(), mb)
      }
      eq.enabled = enabled
    }
  }

  private fun applyAll() = effects.values.forEach(::applyTo)

  /** Lee las ganancias reales del primer efecto (tras aplicar un preset). */
  private fun readLevels(): List<Int> {
    val eq = effects.values.firstOrNull() ?: return levels?.map { it.toInt() } ?: emptyList()
    return runCatching {
      (0 until eq.numberOfBands.toInt()).map { eq.getBandLevel(it.toShort()).toInt() }
    }.getOrElse { levels?.map { it.toInt() } ?: emptyList() }
  }

  override fun definition() = ModuleDefinition {
    Name("AudioEq")

    OnDestroy {
      effects.values.forEach { runCatching { it.release() } }
      effects.clear()
    }

    /**
     * Capacidades del ecualizador del dispositivo: bandas, frecuencias, rango de
     * ganancia y presets. Se consultan con un efecto temporal sobre una sesión
     * libre, porque son del dispositivo y no de una reproducción concreta.
     */
    Function("getInfo") {
      runCatching {
        val am = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
          ?: return@runCatching null
        val session = am.generateAudioSessionId()
        val eq = Equalizer(0, session)
        try {
          val range = eq.bandLevelRange // [min, max] en milibelios
          mapOf(
            "supported" to true,
            "bands" to (0 until eq.numberOfBands.toInt()).map { i ->
              mapOf(
                "index" to i,
                // getCenterFreq viene en miliherzios.
                "centerFreq" to eq.getCenterFreq(i.toShort()) / 1000,
              )
            },
            "minLevel" to range[0].toInt(),
            "maxLevel" to range[1].toInt(),
            "presets" to (0 until eq.numberOfPresets.toInt()).map { eq.getPresetName(it.toShort()) },
          )
        } finally {
          runCatching { eq.release() }
        }
      }.getOrNull() ?: mapOf("supported" to false)
    }

    /** Engancha el ecualizador a una sesión (se llama al crear cada player). */
    Function("attach") { sessionId: Int ->
      if (sessionId == 0 || effects.containsKey(sessionId)) return@Function
      runCatching {
        val eq = Equalizer(0, sessionId)
        effects[sessionId] = eq
        applyTo(eq)
      }
    }

    /** Suelta la sesión (al destruir un player). */
    Function("detach") { sessionId: Int ->
      effects.remove(sessionId)?.let { runCatching { it.release() } }
    }

    Function("setEnabled") { on: Boolean ->
      enabled = on
      applyAll()
    }

    /** Fija todas las ganancias (milibelios), p. ej. al restaurar lo guardado. */
    Function("setBandLevels") { millibels: List<Int> ->
      levels = ShortArray(millibels.size) { millibels[it].toShort() }
      applyAll()
    }

    /** Fija una banda (al mover un slider). */
    Function("setBandLevel") { band: Int, millibels: Int ->
      val cur = levels
      if (cur != null && band < cur.size) {
        cur[band] = millibels.toShort()
      }
      effects.values.forEach { eq ->
        runCatching { eq.setBandLevel(band.toShort(), millibels.toShort()) }
      }
    }

    /** Aplica un preset del dispositivo y devuelve las ganancias resultantes. */
    Function("usePreset") { preset: Int ->
      effects.values.forEach { eq -> runCatching { eq.usePreset(preset.toShort()) } }
      val next = readLevels()
      levels = ShortArray(next.size) { next[it].toShort() }
      next
    }

    /** Ganancias actuales (milibelios). */
    Function("getBandLevels") { readLevels() }
  }
}
