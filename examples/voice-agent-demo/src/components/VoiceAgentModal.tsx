import { useEffect, useMemo } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVoiceAgent } from 'expo-assemblyai';

import { voiceAgentToken } from '../config';
import { useDreams } from '../context/DreamsContext';
import { buildJournalSystemPrompt } from '../prompt';
import { theme } from '../theme';
import { PillButton } from './PillButton';
import { VoiceOrb } from './VoiceOrb';

type Props = { visible: boolean; onClose: () => void };

/**
 * The global voice companion. Reachable from anywhere via the mic FAB. Streams
 * two-way audio with the AssemblyAI Voice Agent, and — critically — seeds the
 * session with the user's journal so asks like "compare today to yesterday"
 * resolve against real entries.
 */
export function VoiceAgentModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible ? <Conversation onClose={onClose} /> : null}
    </Modal>
  );
}

function Conversation({ onClose }: { onClose: () => void }) {
  const { dreams } = useDreams();

  // Snapshot the prompt once when the conversation opens (the session config is
  // sent in the first session.update; rebuilding it mid-call would do nothing).
  const systemPrompt = useMemo(() => buildJournalSystemPrompt(dreams), [dreams]);
  const greeting = useMemo(
    () =>
      dreams.length
        ? "Hi! I've got your dream journal here. What would you like to reflect on?"
        : "Hi! Your journal is empty so far. Tell me about a dream and we can talk it through.",
    [dreams.length]
  );

  const agent = useVoiceAgent({
    token: voiceAgentToken,
    session: { systemPrompt, greeting, voice: 'ivy' },
  });

  // Auto-connect on open, tear down on close.
  useEffect(() => {
    void agent.start();
    return () => {
      void agent.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = agent.status !== 'idle' && agent.status !== 'ended';
  const orbMode = agent.isAgentSpeaking ? 'speaking' : running ? 'listening' : 'idle';

  async function handleClose() {
    await agent.stop();
    onClose();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dream companion</Text>
          <Text style={styles.subtitle}>
            {dreams.length} {dreams.length === 1 ? 'dream' : 'dreams'} in context
          </Text>
        </View>
        <Pressable onPress={handleClose} hitSlop={12}>
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <VoiceOrb
          level={agent.isAgentSpeaking ? agent.outputLevel : agent.inputLevel}
          mode={orbMode}
        />
        <Text style={styles.status}>{statusLabel(agent.status, agent.isAgentSpeaking)}</Text>

        <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptInner}>
          {agent.userTranscript ? (
            <Bubble who="You" text={agent.userTranscript} align="right" color={theme.colors.cyan} />
          ) : null}
          {agent.agentTranscript ? (
            <Bubble who="Companion" text={agent.agentTranscript} align="left" color={theme.colors.pink} />
          ) : null}
          {!agent.userTranscript && !agent.agentTranscript ? (
            <Text style={styles.hint}>
              Try “What did I dream about last night?” or “Compare today’s dream to yesterday’s.”
            </Text>
          ) : null}
        </ScrollView>

        {agent.error ? <Text style={styles.error}>⚠️ {agent.error.message}</Text> : null}

        <View style={styles.controls}>
          {running ? (
            <>
              <PillButton label="End" variant="danger" onPress={handleClose} />
              <PillButton
                label={agent.isMuted ? 'Unmute' : 'Mute'}
                variant="ghost"
                onPress={() => agent.setMuted(!agent.isMuted)}
              />
            </>
          ) : (
            <PillButton
              label="Reconnect"
              loading={agent.status === 'connecting'}
              onPress={agent.start}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
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
  if (speaking) return 'Companion speaking…';
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening…';
    case 'ended':
      return 'Ended';
    case 'error':
      return 'Something went wrong';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  close: { color: theme.colors.cyan, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
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
  controls: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 20 },
});
