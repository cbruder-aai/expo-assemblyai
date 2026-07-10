import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVoiceAgent } from 'expo-assemblyai';

import { voiceAgentToken } from '../config';
import { PillButton } from '../components/PillButton';
import { VoiceOrb } from '../components/VoiceOrb';
import { theme } from '../theme';

/**
 * The headline demo: a full two-way spoken conversation. Mic streams up, the
 * agent's synthesized voice plays back, and a `get_current_time` tool shows how
 * function calling routes through the hook.
 */
export function VoiceAgentScreen() {
  const agent = useVoiceAgent({
    token: voiceAgentToken,
    session: {
      greeting: "Hey! I'm your AssemblyAI voice assistant. Ask me anything.",
      systemPrompt:
        'You are a warm, concise voice assistant built on AssemblyAI. Keep replies to a sentence or two. Use the get_current_time tool when asked about the time.',
      voice: 'ivy',
      tools: [
        {
          type: 'function',
          name: 'get_current_time',
          description: 'Returns the current local time as an ISO string.',
          parameters: { type: 'object', properties: {} },
        },
      ],
    },
    onToolCall: (call) => {
      if (call.name === 'get_current_time') return { iso: new Date().toISOString() };
      return {};
    },
  });

  const running = agent.status !== 'idle' && agent.status !== 'ended';
  const orbMode = agent.isAgentSpeaking ? 'speaking' : running ? 'listening' : 'idle';

  return (
    <View style={styles.container}>
      <VoiceOrb level={agent.isAgentSpeaking ? agent.outputLevel : agent.inputLevel} mode={orbMode} />

      <Text style={styles.status}>{statusLabel(agent.status, agent.isAgentSpeaking)}</Text>

      <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptInner}>
        {agent.userTranscript ? (
          <Bubble who="You" text={agent.userTranscript} align="right" color={theme.colors.cyan} />
        ) : null}
        {agent.agentTranscript ? (
          <Bubble who="Assistant" text={agent.agentTranscript} align="left" color={theme.colors.pink} />
        ) : null}
        {!agent.userTranscript && !agent.agentTranscript ? (
          <Text style={styles.hint}>
            Tap Start, allow the mic, and just talk. Interrupt any time — the agent stops to listen.
          </Text>
        ) : null}
      </ScrollView>

      {agent.error ? <Text style={styles.error}>⚠️ {agent.error.message}</Text> : null}

      <View style={styles.controls}>
        {running ? (
          <>
            <PillButton label="End conversation" variant="danger" onPress={agent.stop} />
            <PillButton
              label={agent.isMuted ? 'Unmute' : 'Mute'}
              variant="ghost"
              onPress={() => agent.setMuted(!agent.isMuted)}
            />
          </>
        ) : (
          <PillButton
            label="Start conversation"
            loading={agent.status === 'connecting'}
            onPress={agent.start}
          />
        )}
      </View>
    </View>
  );
}

function Bubble({
  who,
  text,
  align,
  color,
}: {
  who: string;
  text: string;
  align: 'left' | 'right';
  color: string;
}) {
  return (
    <View style={[styles.bubble, align === 'right' ? styles.right : styles.left]}>
      <Text style={[styles.who, { color }]}>{who}</Text>
      <Text style={styles.bubbleText}>{text}</Text>
    </View>
  );
}

function statusLabel(status: string, speaking: boolean): string {
  if (speaking) return 'Assistant speaking…';
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening…';
    case 'ended':
      return 'Conversation ended';
    case 'error':
      return 'Something went wrong';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  status: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  transcript: { flex: 1, alignSelf: 'stretch' },
  transcriptInner: { paddingVertical: 8, gap: 10 },
  hint: { color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  bubble: {
    maxWidth: '85%',
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: 14,
  },
  left: { alignSelf: 'flex-start', borderTopLeftRadius: 4 },
  right: { alignSelf: 'flex-end', borderTopRightRadius: 4 },
  who: { fontSize: 12, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  bubbleText: { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
  error: { color: theme.colors.danger, marginVertical: 8, textAlign: 'center' },
  controls: { gap: 12, alignItems: 'center', paddingVertical: 20 },
});
