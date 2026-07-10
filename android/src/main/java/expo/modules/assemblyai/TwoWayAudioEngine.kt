package expo.modules.assemblyai

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Full-duplex PCM audio for streaming STT and voice agents.
 *
 * Mic capture uses [MediaRecorder.AudioSource.VOICE_COMMUNICATION], which asks
 * the platform for the same pre-processing a phone call gets (AEC/AGC/NS), and
 * layers an explicit [AcousticEchoCanceler] on top when the device exposes one.
 * Playback is a streaming [AudioTrack]. Both run on their own threads so the mic
 * loop is never blocked by playback.
 *
 * This is intentionally a live-streaming design, not a record-to-file one: two-way
 * audio needs the mic and speaker open together with the far-end audio cancelled
 * out of the near-end signal.
 */
class TwoWayAudioEngine(private val listener: Listener) {
  interface Listener {
    fun onCapture(base64Chunk: String)
    fun onInputLevel(level: Float)
    fun onOutputLevel(level: Float)
    fun onPlaybackFinished()
    fun onError(message: String)
  }

  data class Config(
    val inputSampleRate: Int = 16_000,
    val outputSampleRate: Int = 24_000,
    val enableEchoCancellation: Boolean = true,
    val chunkDurationMs: Int = 100,
  )

  @Volatile private var config = Config()
  @Volatile private var muted = false
  @Volatile private var running = false

  private var record: AudioRecord? = null
  private var track: AudioTrack? = null
  private var aec: AcousticEchoCanceler? = null
  private var ns: NoiseSuppressor? = null
  private var captureJob: Job? = null
  private val scope = CoroutineScope(Dispatchers.Default)

  private val playbackEmpty = Object()
  @Volatile private var queuedFrames = 0

  fun configure(config: Config) {
    this.config = config
  }

  fun setMuted(value: Boolean) {
    muted = value
  }

  @SuppressLint("MissingPermission")
  fun start() {
    if (running) return
    val cfg = config

    val minRecord = AudioRecord.getMinBufferSize(
      cfg.inputSampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      cfg.inputSampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minRecord, cfg.inputSampleRate * 2),
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      listener.onError("AudioRecord failed to initialize")
      recorder.release()
      return
    }
    if (cfg.enableEchoCancellation && AcousticEchoCanceler.isAvailable()) {
      aec = AcousticEchoCanceler.create(recorder.audioSessionId)?.apply { enabled = true }
    }
    if (cfg.enableEchoCancellation && NoiseSuppressor.isAvailable()) {
      ns = NoiseSuppressor.create(recorder.audioSessionId)?.apply { enabled = true }
    }

    val minTrack = AudioTrack.getMinBufferSize(
      cfg.outputSampleRate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    val player = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(cfg.outputSampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build()
      )
      .setBufferSizeInBytes(maxOf(minTrack, cfg.outputSampleRate))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    player.play()

    record = recorder
    track = player
    running = true
    recorder.startRecording()
    captureJob = scope.launch { captureLoop(cfg) }
  }

  fun stop() {
    if (!running) return
    running = false
    runBlocking { captureJob?.cancelAndJoin() }
    captureJob = null
    aec?.release(); aec = null
    ns?.release(); ns = null
    record?.apply { stop(); release() }; record = null
    track?.apply { stop(); flush(); release() }; track = null
    queuedFrames = 0
  }

  private suspend fun captureLoop(cfg: Config) {
    val bytesPerChunk = cfg.inputSampleRate * 2 * cfg.chunkDurationMs / 1000
    val buffer = ByteArray(bytesPerChunk)
    val recorder = record ?: return
    while (scope.isActive && running) {
      var filled = 0
      while (filled < bytesPerChunk && running) {
        val read = recorder.read(buffer, filled, bytesPerChunk - filled)
        if (read <= 0) break
        filled += read
      }
      if (filled <= 0) continue
      val chunk = if (filled == bytesPerChunk) buffer else buffer.copyOf(filled)
      listener.onInputLevel(if (muted) 0f else rms(chunk, filled))
      if (!muted) {
        listener.onCapture(Base64.encodeToString(chunk, Base64.NO_WRAP))
      }
    }
  }

  /** Enqueue agent audio (base64 PCM16 @ [Config.outputSampleRate]) for playback. */
  fun enqueuePlayback(base64: String) {
    if (!running) return
    val pcm = try {
      Base64.decode(base64, Base64.DEFAULT)
    } catch (e: IllegalArgumentException) {
      return
    }
    scope.launch {
      val player = track ?: return@launch
      queuedFrames++
      listener.onOutputLevel(rms(pcm, pcm.size))
      player.write(pcm, 0, pcm.size, AudioTrack.WRITE_BLOCKING)
      queuedFrames--
      if (queuedFrames == 0) listener.onPlaybackFinished()
    }
  }

  /** Barge-in: flush queued agent audio so it stops mid-sentence on interruption. */
  fun clearPlayback() {
    track?.apply {
      pause()
      flush()
      play()
    }
    queuedFrames = 0
  }

  private fun rms(bytes: ByteArray, length: Int): Float {
    val samples = length / 2
    if (samples == 0) return 0f
    var sum = 0.0
    var i = 0
    while (i + 1 < length) {
      val s = (bytes[i].toInt() and 0xFF or (bytes[i + 1].toInt() shl 8)).toShort()
      val norm = s / 32768f
      sum += (norm * norm).toDouble()
      i += 2
    }
    return min(1f, (sqrt(sum / samples) * 4).toFloat())
  }
}
