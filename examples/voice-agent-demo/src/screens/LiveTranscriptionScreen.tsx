import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStreamingTranscription } from 'expo-assemblyai';

import { streamingToken } from '../config';
import { PillButton } from '../components/PillButton';
import { VoiceOrb } from '../components/VoiceOrb';
import { theme } from '../theme';

/** Live speech-to-text: committed final turns plus the in-progress partial. */
export function LiveTranscriptionScreen() {
  const stt = useStreamingTranscription({
    token: streamingToken,
    formatTurns: true,
    keytermsPrompt: ['AssemblyAI', 'Expo', 'React Native'],
  });

  return (
    <View style={styles.container}>
      <VoiceOrb level={stt.inputLevel} mode={stt.isListening ? 'listening' : 'idle'} />
      <Text style={styles.status}>{stt.isListening ? 'Listening…' : 'Ready'}</Text>

      <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptInner}>
        {stt.transcript ? <Text style={styles.final}>{stt.transcript}</Text> : null}
        {stt.partialTranscript ? <Text style={styles.partial}>{stt.partialTranscript}</Text> : null}
        {!stt.transcript && !stt.partialTranscript ? (
          <Text style={styles.hint}>Tap Start and speak — words appear as you talk.</Text>
        ) : null}
      </ScrollView>

      {stt.error ? <Text style={styles.error}>⚠️ {stt.error.message}</Text> : null}

      <View style={styles.controls}>
        {stt.isListening ? (
          <PillButton label="Stop" variant="danger" onPress={stt.stop} />
        ) : (
          <PillButton label="Start transcribing" onPress={stt.start} />
        )}
      </View>
    </View>
  );
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
  transcriptInner: { paddingVertical: 8 },
  hint: { color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  final: { color: theme.colors.text, fontSize: 20, lineHeight: 30 },
  partial: { color: theme.colors.textMuted, fontSize: 20, lineHeight: 30, fontStyle: 'italic' },
  error: { color: theme.colors.danger, marginVertical: 8, textAlign: 'center' },
  controls: { gap: 12, alignItems: 'center', paddingVertical: 20 },
});
