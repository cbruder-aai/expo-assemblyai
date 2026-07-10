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
      let resolve: (Bool) -> Void = { granted in
        promise.resolve(["granted": granted, "canAskAgain": true, "status": granted ? "granted" : "denied"])
      }
      // `AVAudioApplication` is iOS 17+; fall back to the deprecated
      // `AVAudioSession` permission API on older systems.
      if #available(iOS 17.0, *) {
        AVAudioApplication.requestRecordPermission(completionHandler: resolve)
      } else {
        AVAudioSession.sharedInstance().requestRecordPermission(resolve)
      }
    }

    Function("getRecordingPermissionsAsync") { () -> [String: Any] in
      // Normalize both the iOS 17+ (`AVAudioApplication`) and legacy
      // (`AVAudioSession`) record-permission enums to undetermined/granted/denied.
      let isGranted: Bool
      let isUndetermined: Bool
      if #available(iOS 17.0, *) {
        let status = AVAudioApplication.shared.recordPermission
        isGranted = status == .granted
        isUndetermined = status == .undetermined
      } else {
        let status = AVAudioSession.sharedInstance().recordPermission
        isGranted = status == .granted
        isUndetermined = status == .undetermined
      }
      return [
        "granted": isGranted,
        "canAskAgain": isUndetermined,
        "status": isGranted ? "granted" : (isUndetermined ? "undetermined" : "denied"),
      ]
    }

    // MARK: Session control

    AsyncFunction("initialize") { (options: AudioConfig) in
      audio.configure(
        .init(
          // Sample rates cross the JS bridge as integer Hz (matching the Android
          // module and the TS `AudioSessionConfig`); the engine wants Double for
          // AVAudioFormat, so widen here at the boundary.
          inputSampleRate: Double(options.inputSampleRate),
          outputSampleRate: Double(options.outputSampleRate),
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
  @Field var inputSampleRate: Int = 16_000
  @Field var outputSampleRate: Int = 24_000
  @Field var enableEchoCancellation: Bool = true
  @Field var chunkDurationMs: Int = 100
}
