package expo.modules.assemblyai

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.interfaces.permissions.Permissions

/**
 * Android native two-way audio bridge for `expo-assemblyai`.
 *
 * Mirrors [ExpoAssemblyAIModule.swift]: same function/event names so the JS
 * layer is platform-agnostic. The WebSocket lives in JS; this module only moves
 * PCM in and out of the hardware.
 */
class ExpoAssemblyAIModule : Module(), TwoWayAudioEngine.Listener {
  private val engine = TwoWayAudioEngine(this)

  override fun definition() = ModuleDefinition {
    Name("ExpoAssemblyAI")

    Events(
      "onMicrophoneData",
      "onInputVolume",
      "onOutputVolume",
      "onPlaybackFinished",
      "onError",
    )

    OnDestroy { engine.stop() }

    AsyncFunction("requestRecordingPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions, promise, Manifest.permission.RECORD_AUDIO,
      )
    }

    AsyncFunction("getRecordingPermissionsAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(
        appContext.permissions, promise, Manifest.permission.RECORD_AUDIO,
      )
    }

    AsyncFunction("initialize") { options: AudioConfig ->
      engine.configure(
        TwoWayAudioEngine.Config(
          inputSampleRate = options.inputSampleRate,
          outputSampleRate = options.outputSampleRate,
          enableEchoCancellation = options.enableEchoCancellation,
          chunkDurationMs = options.chunkDurationMs,
        )
      )
    }

    AsyncFunction("start") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw Exceptions.MissingPermissions(Manifest.permission.RECORD_AUDIO)
      }
      engine.start()
    }

    AsyncFunction("stop") { engine.stop() }
    Function("setMuted") { muted: Boolean -> engine.setMuted(muted) }
    Function("enqueuePlayback") { base64: String -> engine.enqueuePlayback(base64) }
    Function("clearPlayback") { engine.clearPlayback() }
  }

  override fun onCapture(base64Chunk: String) = sendEvent("onMicrophoneData", mapOf("data" to base64Chunk))
  override fun onInputLevel(level: Float) = sendEvent("onInputVolume", mapOf("level" to level))
  override fun onOutputLevel(level: Float) = sendEvent("onOutputVolume", mapOf("level" to level))
  override fun onPlaybackFinished() = sendEvent("onPlaybackFinished", emptyMap<String, Any>())
  override fun onError(message: String) = sendEvent("onError", mapOf("message" to message))
}

class AudioConfig : Record {
  @Field var inputSampleRate: Int = 16_000
  @Field var outputSampleRate: Int = 24_000
  @Field var enableEchoCancellation: Boolean = true
  @Field var chunkDurationMs: Int = 100
}
