package co.skillsale.print

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Beep + Thai TTS for scan/package feedback.
 * Runs on the Android side so WebView AudioContext / speechSynthesis
 * never interfere with the Bluetooth print bridge.
 */
class ScanFeedbackPlayer(context: Context) {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeak: String? = null
    private var released = false

    init {
        tts =
            TextToSpeech(appContext) { status ->
                if (released) return@TextToSpeech
                ttsReady = status == TextToSpeech.SUCCESS
                if (!ttsReady) return@TextToSpeech
                val engine = tts ?: return@TextToSpeech
                val thai = Locale("th", "TH")
                val result = engine.setLanguage(thai)
                if (
                    result == TextToSpeech.LANG_MISSING_DATA ||
                    result == TextToSpeech.LANG_NOT_SUPPORTED
                ) {
                    engine.language = Locale.getDefault()
                }
                pendingSpeak?.let { text ->
                    pendingSpeak = null
                    speakNow(text)
                }
            }
    }

    fun playSuccess(spokenLabel: String?) {
        mainHandler.post {
            playTone(ToneGenerator.TONE_PROP_ACK, 140)
            val label = spokenLabel?.trim().orEmpty()
            if (label.isNotEmpty()) {
                mainHandler.postDelayed({ speak(label) }, 120L)
            }
        }
    }

    fun playError(spokenLabel: String?) {
        mainHandler.post {
            playTone(ToneGenerator.TONE_PROP_NACK, 220)
            val label = spokenLabel?.trim().orEmpty().ifEmpty { "ไม่พบรายการ" }
            mainHandler.postDelayed({ speak(label) }, 80L)
        }
    }

    fun unlock() {
        // Native audio does not need a user-gesture unlock; keep for API parity.
    }

    fun release() {
        released = true
        mainHandler.removeCallbacksAndMessages(null)
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Exception) {
            /* ignore */
        }
        tts = null
        ttsReady = false
        pendingSpeak = null
    }

    private fun playTone(toneType: Int, durationMs: Int) {
        var tone: ToneGenerator? = null
        try {
            tone = ToneGenerator(AudioManager.STREAM_MUSIC, 85)
            tone.startTone(toneType, durationMs)
            mainHandler.postDelayed(
                {
                    try {
                        tone.release()
                    } catch (_: Exception) {
                        /* ignore */
                    }
                },
                (durationMs + 80).toLong(),
            )
        } catch (_: Exception) {
            try {
                tone?.release()
            } catch (_: Exception) {
                /* ignore */
            }
        }
    }

    private fun speak(text: String) {
        if (!ttsReady) {
            pendingSpeak = text
            return
        }
        speakNow(text)
    }

    private fun speakNow(text: String) {
        val engine = tts ?: return
        try {
            engine.stop()
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "skillsale-scan-feedback")
        } catch (_: Exception) {
            /* ignore */
        }
    }
}
