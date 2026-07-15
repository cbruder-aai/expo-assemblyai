import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useVoiceAgent } from 'expo-assemblyai';

import { voiceAgentToken } from '../config';
import { useDreams } from '../context/DreamsContext';
import {
  DEFAULT_PERSONALITY,
  PERSONALITIES,
  VOICES,
  voiceLabel,
  type Personality,
} from '../personalities';
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
      {/*
       * A Modal renders in its own native view hierarchy on iOS, so the app-root
       * SafeAreaProvider's insets don't reliably reach inside it — the SafeAreaView
       * would intermittently get a zero top inset and slide under the notch. Giving
       * the modal its own provider re-measures the insets in this hierarchy.
       */}
      {visible ? (
        <SafeAreaProvider>
          <Conversation onClose={onClose} />
        </SafeAreaProvider>
      ) : null}
    </Modal>
  );
}

function Conversation({ onClose }: { onClose: () => void }) {
  const { dreams } = useDreams();
  const [personality, setPersonality] = useState<Personality>(DEFAULT_PERSONALITY);
  // Voice defaults to the personality's, but is independently selectable.
  const [voice, setVoice] = useState<string>(DEFAULT_PERSONALITY.voice);

  // Picking a personality swaps the persona and resets the voice to its default;
  // the voice picker can then override it.
  function choosePersonality(p: Personality) {
    setPersonality(p);
    setVoice(p.voice);
  }

  // The prompt and greeting are derived from the journal + chosen personality.
  // They feed the first session.update; the voice in particular is immutable
  // once a session is established, so changing either reconnects the agent.
  const systemPrompt = useMemo(
    () => buildJournalSystemPrompt(dreams, personality),
    [dreams, personality]
  );
  const greeting = useMemo(
    () => personality.greeting(dreams.length > 0),
    [personality, dreams.length]
  );

  const agent = useVoiceAgent({
    token: voiceAgentToken,
    session: { systemPrompt, greeting, voice },
  });

  // Connect on open, and reconnect whenever the personality or voice changes (a
  // new persona or voice can only take effect on a fresh session).
  const activeKey = useRef(`${personality.id}:${voice}`);
  useEffect(() => {
    const key = `${personality.id}:${voice}`;
    const switching = activeKey.current !== key;
    activeKey.current = key;
    let cancelled = false;
    void (async () => {
      if (switching) await agent.stop();
      if (!cancelled) await agent.start();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personality.id, voice]);

  // Tear down the session when the modal unmounts.
  useEffect(() => {
    return () => {
      void agent.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = agent.status === 'listening' || agent.status === 'speaking';
  const orbMode = agent.isAgentSpeaking ? 'speaking' : running ? 'listening' : 'idle';

  // Keep the newest bubble in view as the conversation grows and as the live
  // transcript of the current turn extends.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = () => scrollRef.current?.scrollToEnd({ animated: true });

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

      <PersonalityPicker selected={personality} onSelect={choosePersonality} />
      <VoicePicker selected={voice} onSelect={setVoice} />

      <View style={styles.body}>
        <VoiceOrb
          level={agent.isAgentSpeaking ? agent.outputLevel : agent.inputLevel}
          mode={orbMode}
        />
        <Text style={styles.status}>{statusLabel(agent.status, agent.isAgentSpeaking)}</Text>

        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptInner}
          onContentSizeChange={scrollToEnd}
        >
          {agent.messages.length ? (
            agent.messages.map((m) =>
              m.role === 'user' ? (
                <Bubble
                  key={m.id}
                  who="You"
                  text={m.text}
                  align="right"
                  color={theme.colors.accent}
                  // Only the user turn is ever live: transcript.user.delta streams
                  // partial text (isFinal=false) until transcript.user finalizes it.
                  // The agent transcript always arrives already final (see README).
                  pending={!m.isFinal}
                />
              ) : (
                <Bubble
                  key={m.id}
                  who={personality.label}
                  text={m.text}
                  align="left"
                  color={personality.color}
                />
              )
            )
          ) : (
            <Text style={styles.hint}>
              Try “What did I dream about last night?” or “Compare today’s dream to yesterday’s.”
            </Text>
          )}
        </ScrollView>

        {agent.error ? (
          <View style={styles.errorChip}>
            <Text style={styles.error}>{agent.error.message}</Text>
          </View>
        ) : null}

        <View style={styles.controls}>
          {agent.status === 'connecting' ? (
            <PillButton label="Connecting…" loading onPress={agent.start} />
          ) : running ? (
            <>
              <PillButton label="End" variant="danger" onPress={handleClose} />
              <PillButton
                label={agent.isMuted ? 'Unmute' : 'Mute'}
                variant="ghost"
                onPress={() => agent.setMuted(!agent.isMuted)}
              />
            </>
          ) : (
            // idle / ended / error — the session is down; offer a fresh start.
            <PillButton label="Reconnect" onPress={agent.start} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * Horizontal row of personality chips. Selecting one swaps the companion's
 * persona and voice; the conversation reconnects to apply it (see Conversation).
 */
function PersonalityPicker({
  selected,
  onSelect,
}: {
  selected: Personality;
  onSelect: (p: Personality) => void;
}) {
  return (
    <View style={styles.picker}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerRow}>
        {PERSONALITIES.map((p) => {
          const active = p.id === selected.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => onSelect(p)}
              style={[
                styles.chip,
                active && { borderColor: p.color, backgroundColor: `${p.color}22` },
              ]}>
              <Text style={styles.chipEmoji}>{p.emoji}</Text>
              <Text style={[styles.chipLabel, active && { color: p.color }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.pickerTagline}>{selected.tagline}</Text>
    </View>
  );
}

/**
 * Horizontal row of voice chips. Selecting one changes the synthesized voice;
 * like the personality, it can only apply on a fresh session, so the
 * conversation reconnects (see Conversation).
 */
function VoicePicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (voice: string) => void;
}) {
  return (
    <View style={styles.voicePicker}>
      <Text style={styles.voiceLabel}>Voice · {voiceLabel(selected)}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerRow}>
        {VOICES.map((v) => {
          const active = v.id === selected;
          return (
            <Pressable
              key={v.id}
              onPress={() => onSelect(v.id)}
              style={[styles.voiceChip, active && styles.voiceChipActive]}>
              <Text style={[styles.voiceChipLabel, active && styles.voiceChipLabelActive]}>
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Bubble({
  who,
  text,
  align,
  color,
  pending = false,
}: {
  who: string;
  text: string;
  align: 'left' | 'right';
  color: string;
  /** True while this turn is still being transcribed live (streaming deltas). */
  pending?: boolean;
}) {
  return (
    <View style={[styles.bubble, align === 'right' ? styles.right : styles.left, pending && styles.bubblePending]}>
      <Text style={[styles.who, { color }]}>{who}</Text>
      <Text style={[styles.bubbleText, pending && styles.bubbleTextPending]}>
        {text}
        {pending ? <LiveCaret /> : null}
      </Text>
    </View>
  );
}

/**
 * A blinking caret appended to the live user bubble to signal that the text is
 * still streaming in from transcript.user.delta and not yet finalized.
 *
 * Blinks by toggling color, not an Animated opacity: this node is nested inside
 * a <Text>, which makes it a virtual text node on Android — it has no native
 * view tag, so native-driver animations can't target it. Color is one of the
 * few styles virtual text nodes support on every platform.
 */
function LiveCaret() {
  const [lit, setLit] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setLit((v) => !v), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <Text style={[styles.caret, { color: lit ? theme.colors.accent : 'transparent' }]}>▍</Text>
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
  title: { color: theme.colors.text, fontSize: 19, fontWeight: '700', letterSpacing: 0.2 },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  close: { color: theme.colors.accent, fontSize: 16, fontWeight: '600' },
  picker: { paddingBottom: 4 },
  pickerRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipEmoji: { fontSize: 15 },
  chipLabel: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  pickerTagline: {
    color: theme.colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  voicePicker: { paddingTop: 8, paddingBottom: 4 },
  voiceLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  voiceChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  voiceChipActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
  voiceChipLabel: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  voiceChipLabelActive: { color: theme.colors.accent },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  status: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
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
  who: { fontSize: 11, fontWeight: '600', marginBottom: 4, letterSpacing: 0.8, textTransform: 'uppercase' },
  bubbleText: { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
  bubblePending: { opacity: 0.9, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.accent },
  bubbleTextPending: { color: theme.colors.textMuted },
  caret: { color: theme.colors.accent, fontStyle: 'normal', fontWeight: '700' },
  errorChip: {
    backgroundColor: 'rgba(240,112,138,0.12)',
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginVertical: 8,
  },
  error: { color: theme.colors.danger, fontSize: 14, textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 20 },
});
