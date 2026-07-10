import AVFoundation
import ExpoModulesCore

/// Native two-way audio bridge for `expo-assemblyai`.
///
/// Owns a `TwoWayAudioEngine` (full-duplex mic + speaker with echo cancellation)
/// and exposes it to JS as functions + events. The JS `StreamingTranscriber` /
/// `VoiceAgent` clients own the WebSocket; this module only moves PCM in and out
/// of the hardware. Keeping the transport in JS (not native) is deliberate — it
/// keeps the native surface tiny, testable, and identical across iOS/Android.
public class ExpoAssemblyAIModule: Module, TwoWayAudioEngineDelegate {
  private let audio = TwoWayAudioEngine()

  public func definition() -> ModuleDefinition {
    Name("ExpoAssemblyAI")

    Events(
      "onMicrophoneData",  // { data: base64 PCM16 }
      "onInputVolume",  // { level: 0…1 }
      "onOutputVolume",  // { level: 0…1 }
      "onPlaybackFinished",  // {}
      "onError"  // { message }
    )

    OnCreate { audio.delegate = self }
    OnDestroy { audio.stop() }

    // MARK: Permissions

    AsyncFunction("requestRecordingPermissionsAsync") { (promise: Promise) in
      AVAudioApplication.requestRecordPermission { granted in
        promise.resolve(["granted": granted, "canAskAgain": true, "status": granted ? "granted" : "denied"])
      }
    }

    Function("getRecordingPermissionsAsync") { () -> [String: Any] in
      let status = AVAudioApplication.shared.recordPermission
      let granted = status == .granted
      return [
        "granted": granted,
        "canAskAgain": status == .undetermined,
        "status": granted ? "granted" : (status == .undetermined ? "undetermined" : "denied"),
      ]
    }

    // MARK: Session control

    AsyncFunction("initialize") { (options: AudioConfig) in
      audio.configure(
        .init(
          inputSampleRate: options.inputSampleRate,
          outputSampleRate: options.outputSampleRate,
          enableEchoCancellation: options.enableEchoCancellation,
          chunkDurationMs: options.chunkDurationMs))
    }

    AsyncFunction("start") { try audio.start() }
    AsyncFunction("stop") { audio.stop() }
    Function("setMuted") { (muted: Bool) in audio.setMuted(muted) }

    // MARK: Playback (agent audio)

    Function("enqueuePlayback") { (base64: String) in audio.enqueuePlayback(base64) }
    Function("clearPlayback") { audio.clearPlayback() }
  }

  // MARK: - TwoWayAudioEngineDelegate

  func audioEngine(_ engine: TwoWayAudioEngine, didCapture base64Chunk: String) {
    sendEvent("onMicrophoneData", ["data": base64Chunk])
  }
  func audioEngine(_ engine: TwoWayAudioEngine, didUpdateInputLevel level: Float) {
    sendEvent("onInputVolume", ["level": level])
  }
  func audioEngine(_ engine: TwoWayAudioEngine, didUpdateOutputLevel level: Float) {
    sendEvent("onOutputVolume", ["level": level])
  }
  func audioEngineDidFinishPlayback(_ engine: TwoWayAudioEngine) {
    sendEvent("onPlaybackFinished", [:])
  }
  func audioEngine(_ engine: TwoWayAudioEngine, didFail message: String) {
    sendEvent("onError", ["message": message])
  }
}

/// Mirrors the JS `AudioSessionConfig`. Field names/defaults must stay in sync
/// with `src/ExpoAssemblyAIModule.types.ts`.
struct AudioConfig: Record {
  @Field var inputSampleRate: Double = 16_000
  @Field var outputSampleRate: Double = 24_000
  @Field var enableEchoCancellation: Bool = true
  @Field var chunkDurationMs: Int = 100
}
