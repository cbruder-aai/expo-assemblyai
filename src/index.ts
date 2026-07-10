/**
 * expo-assemblyai — React Native / Expo SDK for AssemblyAI.
 *
 * Three layers:
 *  - **Native audio** (`AudioSession`): full-duplex mic + speaker with echo
 *    cancellation. The seam everything else is built on.
 *  - **Clients** (`StreamingTranscriber`, `VoiceAgent`, `RestClient`, `LlmGateway`):
 *    typed wrappers over the AssemblyAI streaming, voice-agent, STT, and LLM APIs.
 *  - **Hooks** (`useVoiceAgent`, `useStreamingTranscription`, `useMicrophonePermissions`):
 *    the "just import a hook" path for the common cases.
 *
 * Security: streaming/agent sessions use ephemeral tokens minted by *your*
 * backend — never ship your API key. See `TokenProvider` / `createStreamingToken`.
 */

// Native audio seam
export { NativeAudioSession, sharedAudioSession, type AudioSession } from './audio/AudioSession';
export type {
  AudioSessionConfig,
  PermissionResponse,
  MicrophoneDataEvent,
  VolumeEvent,
  AudioErrorEvent,
} from './ExpoAssemblyAIModule.types';

// Tokens (security)
export {
  createStreamingToken,
  createVoiceAgentToken,
  type TokenProvider,
  type StreamingTokenOptions,
} from './client/tokens';

// Streaming STT
export {
  StreamingTranscriber,
  type StreamingTranscriberOptions,
  type StreamingTurn,
  type StreamingWord,
  type StreamingBegin,
  type StreamingTermination,
} from './client/StreamingTranscriber';

// Voice Agent (bidirectional)
export {
  VoiceAgent,
  type VoiceAgentOptions,
  type AgentSessionConfig,
  type AgentTool,
  type AgentToolCall,
  type AudioEncoding,
} from './client/VoiceAgent';

// Async STT + Audio Intelligence
export {
  RestClient,
  type RestClientOptions,
  type TranscribeParams,
  type Transcript,
} from './client/RestClient';

// LLM Gateway
export {
  LlmGateway,
  type LlmGatewayOptions,
  type ChatMessage,
  type ChatCompletionParams,
  type ChatCompletion,
} from './client/LlmGateway';

// Hooks
export { useMicrophonePermissions } from './hooks/useMicrophonePermissions';
export {
  useStreamingTranscription,
  type UseStreamingTranscriptionResult,
} from './hooks/useStreamingTranscription';
export {
  useVoiceAgent,
  type UseVoiceAgentOptions,
  type UseVoiceAgentResult,
  type VoiceAgentStatus,
} from './hooks/useVoiceAgent';
