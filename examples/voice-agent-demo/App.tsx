import { useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { LiveTranscriptionScreen } from './src/screens/LiveTranscriptionScreen';
import { VoiceAgentScreen } from './src/screens/VoiceAgentScreen';
import { theme } from './src/theme';

type Tab = 'agent' | 'transcribe';

export default function App() {
  const [tab, setTab] = useState<Tab>('agent');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <Text style={styles.brand}>
          Assembly<Text style={{ color: theme.colors.pink }}>AI</Text>
        </Text>
        <Text style={styles.tagline}>expo-assemblyai · two-way voice</Text>
      </View>

      <View style={styles.tabs}>
        <TabButton label="Voice Agent" active={tab === 'agent'} onPress={() => setTab('agent')} />
        <TabButton
          label="Live Transcription"
          active={tab === 'transcribe'}
          onPress={() => setTab('transcribe')}
        />
      </View>

      <View style={styles.body}>
        {tab === 'agent' ? <VoiceAgentScreen /> : <LiveTranscriptionScreen />}
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  brand: { color: theme.colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2, letterSpacing: 0.5 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: theme.colors.surfaceRaised },
  tabLabel: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 14 },
  tabLabelActive: { color: theme.colors.cyan },
  body: { flex: 1, paddingTop: 8 },
});
