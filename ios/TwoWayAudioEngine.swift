import AVFoundation
import Foundation

/// Delegate for the full-duplex audio engine. All callbacks are delivered on an
/// internal serial queue; the module hops them to the JS thread via `sendEvent`.
protocol TwoWayAudioEngineDelegate: AnyObject {
  /// A mic chunk, resampled to the configured input geometry, base64-encoded PCM16 LE mono.
  func audioEngine(_ engine: TwoWayAudioEngine, didCapture base64Chunk: String)
  /// Normalized 0…1 input meter (RMS), for "is it listening" UI.
  func audioEngine(_ engine: TwoWayAudioEngine, didUpdateInputLevel level: Float)
  /// Normalized 0…1 output meter (RMS) of the agent audio currently playing.
  func audioEngine(_ engine: TwoWayAudioEngine, didUpdateOutputLevel level: Float)
  /// The playback queue drained (agent finished speaking everything enqueued).
  func audioEngineDidFinishPlayback(_ engine: TwoWayAudioEngine)
  /// A non-recoverable audio error.
  func audioEngine(_ engine: TwoWayAudioEngine, didFail message: String)
}

/// Live, full-duplex PCM audio for streaming STT and voice agents.
///
/// This is deliberately an `AVAudioEngine` graph with **voice-processing IO**
/// (Apple's built-in Acoustic Echo Cancellation + noise suppression), NOT the
/// file-based `AVAudioRecorder` used by dictation apps like Blurt. Two-way audio
/// needs the mic and speaker running at the same time with the far-end (agent)
/// audio cancelled out of the near-end (mic) signal — exactly what voice
/// processing does and exactly what a record-to-WAV path cannot.
///
/// - Capture: a tap on the input node, resampled to `inputSampleRate` mono PCM16,
///   accumulated into ~`chunkDurationMs` frames and handed up as base64.
/// - Playback: agent audio (base64 PCM16 at `outputSampleRate`) is decoded,
///   resampled to the engine format, and scheduled on a player node so it plays
///   through the same graph the AEC reference is taken from.
final class TwoWayAudioEngine {
  struct Config {
    var inputSampleRate: Double = 16_000
    var outputSampleRate: Double = 24_000
    var enableEchoCancellation: Bool = true
    var chunkDurationMs: Int = 100
  }

  weak var delegate: TwoWayAudioEngineDelegate?

  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let queue = DispatchQueue(label: "com.assemblyai.expo.audio")

  private var config = Config()
  private var isRunning = false
  private var isMuted = false

  /// Format the player node runs at (engine main-mixer format); playback buffers
  /// are converted into this before scheduling.
  private var playbackFormat: AVAudioFormat?
  /// Target capture format handed up to JS: mono, PCM16, `inputSampleRate`.
  private var captureFormat: AVAudioFormat?
  private var captureConverter: AVAudioConverter?
  private var pendingCapture = Data()
  /// Number of scheduled-but-not-yet-played playback buffers, so we can report
  /// "finished speaking" exactly once when the queue drains.
  private var scheduledPlaybackBuffers = 0

  // MARK: - Lifecycle

  func configure(_ config: Config) {
    queue.sync { self.config = config }
  }

  func start() throws {
    try queue.sync {
      guard !isRunning else { return }
      try configureSession()
      try installGraph()
      try engine.start()
      player.play()
      isRunning = true
    }
  }

  func stop() {
    queue.sync {
      guard isRunning else { return }
      engine.inputNode.removeTap(onBus: 0)
      player.stop()
      engine.stop()
      pendingCapture.removeAll(keepingCapacity: true)
      scheduledPlaybackBuffers = 0
      isRunning = false
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  func setMuted(_ muted: Bool) {
    queue.sync { isMuted = muted }
  }

  // MARK: - Playback (agent audio, base64 PCM16 @ outputSampleRate)

  func enqueuePlayback(_ base64: String) {
    queue.async { [weak self] in
      guard let self, self.isRunning, let buffer = self.decodePlaybackBuffer(base64) else { return }
      self.scheduledPlaybackBuffers += 1
      self.player.scheduleBuffer(buffer) { [weak self] in
        self?.queue.async {
          guard let self else { return }
          self.scheduledPlaybackBuffers = max(0, self.scheduledPlaybackBuffers - 1)
          if self.scheduledPlaybackBuffers == 0 {
            self.delegate?.audioEngineDidFinishPlayback(self)
          }
        }
      }
      self.delegate?.audioEngine(self, didUpdateOutputLevel: Self.rms(of: buffer))
    }
  }

  /// Barge-in: drop everything queued so the agent stops mid-sentence when the
  /// user interrupts. The streaming layer decides *when* to call this (on
  /// `input.speech.started` / a client-side VAD event).
  func clearPlayback() {
    queue.async { [weak self] in
      guard let self else { return }
      self.player.stop()
      self.scheduledPlaybackBuffers = 0
      if self.isRunning { self.player.play() }
    }
  }

  // MARK: - Graph setup

  private func configureSession() throws {
    let session = AVAudioSession.sharedInstance()
    // `.voiceChat` mode turns on the same signal processing as a phone call
    // (AEC/AGC); `.playAndRecord` is required for simultaneous mic + speaker.
    try session.setCategory(
      .playAndRecord,
      mode: config.enableEchoCancellation ? .voiceChat : .default,
      options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
    try session.setPreferredSampleRate(config.outputSampleRate)
    try session.setActive(true, options: .notifyOthersOnDeactivation)
  }

  private func installGraph() throws {
    let input = engine.inputNode
    if config.enableEchoCancellation {
      // Voice-processing IO: hardware/OS AEC referencing the speaker output.
      try input.setVoiceProcessingEnabled(true)
    }

    let hardwareFormat = input.outputFormat(forBus: 0)
    playbackFormat = hardwareFormat

    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: hardwareFormat)

    guard
      let capture = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: config.inputSampleRate,
        channels: 1,
        interleaved: true)
    else { throw AudioError.formatUnavailable }
    captureFormat = capture
    captureConverter = AVAudioConverter(from: hardwareFormat, to: capture)

    let framesPerBuffer = AVAudioFrameCount(hardwareFormat.sampleRate * 0.02)  // ~20ms taps
    input.installTap(onBus: 0, bufferSize: framesPerBuffer, format: hardwareFormat) {
      [weak self] buffer, _ in
      self?.queue.async { self?.handleCapture(buffer) }
    }
    engine.prepare()
  }

  // MARK: - Capture path

  private func handleCapture(_ buffer: AVAudioPCMBuffer) {
    delegate?.audioEngine(self, didUpdateInputLevel: isMuted ? 0 : Self.rms(of: buffer))
    guard !isMuted, let converter = captureConverter, let captureFormat else { return }

    let ratio = captureFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 1)
    guard let out = AVAudioPCMBuffer(pcmFormat: captureFormat, frameCapacity: capacity) else { return }

    var supplied = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if supplied {
        status.pointee = .noDataNow
        return nil
      }
      supplied = true
      status.pointee = .haveData
      return buffer
    }
    if error != nil || out.frameLength == 0 { return }

    if let channel = out.int16ChannelData {
      pendingCapture.append(
        UnsafeBufferPointer(start: channel[0], count: Int(out.frameLength)).withMemoryRebound(
          to: UInt8.self
        ) { Data(buffer: $0) })
    }
    flushChunksIfNeeded()
  }

  /// Emit fixed-size chunks (`chunkDurationMs`) so the streaming layer sends
  /// frames the API accepts (Universal Streaming wants 50–1000ms per frame).
  private func flushChunksIfNeeded() {
    guard let captureFormat else { return }
    let bytesPerChunk = Int(captureFormat.sampleRate) * 2 * config.chunkDurationMs / 1000
    guard bytesPerChunk > 0 else { return }
    while pendingCapture.count >= bytesPerChunk {
      let chunk = pendingCapture.prefix(bytesPerChunk)
      pendingCapture.removeFirst(bytesPerChunk)
      delegate?.audioEngine(self, didCapture: Data(chunk).base64EncodedString())
    }
  }

  private func decodePlaybackBuffer(_ base64: String) -> AVAudioPCMBuffer? {
    guard
      let data = Data(base64Encoded: base64), !data.isEmpty,
      let sourceFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: config.outputSampleRate, channels: 1,
        interleaved: true),
      let playbackFormat
    else { return nil }

    let sourceFrames = AVAudioFrameCount(data.count / 2)
    guard
      let source = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: sourceFrames),
      let converter = AVAudioConverter(from: sourceFormat, to: playbackFormat)
    else { return nil }
    source.frameLength = sourceFrames
    if let channel = source.int16ChannelData {
      data.withUnsafeBytes { raw in
        channel[0].update(from: raw.bindMemory(to: Int16.self).baseAddress!, count: Int(sourceFrames))
      }
    }

    let ratio = playbackFormat.sampleRate / sourceFormat.sampleRate
    let capacity = AVAudioFrameCount(Double(sourceFrames) * ratio + 1)
    guard let out = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: capacity) else {
      return nil
    }
    var supplied = false
    converter.convert(to: out, error: nil) { _, status in
      if supplied {
        status.pointee = .noDataNow
        return nil
      }
      supplied = true
      status.pointee = .haveData
      return source
    }
    return out.frameLength > 0 ? out : nil
  }

  // MARK: - Helpers

  /// RMS mapped to 0…1 for meter UI (floored so ambient reads as empty bars,
  /// mirroring Blurt's `linearLevel(fromPowerDB:)`).
  static func rms(of buffer: AVAudioPCMBuffer) -> Float {
    if let floatData = buffer.floatChannelData {
      let frames = Int(buffer.frameLength)
      guard frames > 0 else { return 0 }
      var sum: Float = 0
      for i in 0..<frames { sum += floatData[0][i] * floatData[0][i] }
      return min(1, sqrt(sum / Float(frames)) * 4)
    }
    if let intData = buffer.int16ChannelData {
      let frames = Int(buffer.frameLength)
      guard frames > 0 else { return 0 }
      var sum: Float = 0
      for i in 0..<frames {
        let s = Float(intData[0][i]) / Float(Int16.max)
        sum += s * s
      }
      return min(1, sqrt(sum / Float(frames)) * 4)
    }
    return 0
  }

  enum AudioError: Error { case formatUnavailable }
}
