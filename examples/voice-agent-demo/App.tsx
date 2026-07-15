import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// RN's own SafeAreaView is iOS-only; Expo is edge-to-edge on Android, so use
// safe-area-context to keep the header/tabs out from under the status bar.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { DreamsProvider } from './src/context/DreamsContext';
import { DreamEditorModal } from './src/components/DreamEditorModal';
import { VoiceAgentModal } from './src/components/VoiceAgentModal';
import { VoiceFab } from './src/components/VoiceFab';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { JournalListScreen } from './src/screens/JournalListScreen';
import { theme } from './src/theme';

type Tab = 'list' | 'calendar';

export default function App() {
  return (
    <SafeAreaProvider>
      <DreamsProvider>
        <Root />
      </DreamsProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const [tab, setTab] = useState<Tab>('list');
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <CrescentMoon />
        <View>
          <Text style={styles.brand}>Nocturne</Text>
          <Text style={styles.tagline}>Dream journal</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton label="List" active={tab === 'list'} onPress={() => setTab('list')} />
        <TabButton label="Calendar" active={tab === 'calendar'} onPress={() => setTab('calendar')} />
      </View>

      <View style={styles.body}>
        {tab === 'list' ? (
          <JournalListScreen onOpenDay={setEditorDate} />
        ) : (
          <CalendarScreen onOpenDay={setEditorDate} />
        )}
      </View>

      <VoiceFab onPress={() => setVoiceOpen(true)} />

      <DreamEditorModal date={editorDate} onClose={() => setEditorDate(null)} />
      <VoiceAgentModal visible={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </SafeAreaView>
  );
}

/** A drawn crescent: an accent disc with an offset background disc cut over it. */
function CrescentMoon() {
  return (
    <View style={styles.moon}>
      <View style={styles.moonCut} />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  brand: { color: theme.colors.text, fontSize: 24, fontWeight: '700', letterSpacing: 0.2 },
  tagline: { color: theme.colors.textMuted, fontSize: 12, marginTop: 1, letterSpacing: 0.4 },
  moon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.gold,
    overflow: 'hidden',
  },
  moonCut: {
    position: 'absolute',
    top: -4,
    left: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.background,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 8,
    padding: 3,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: theme.colors.surfaceRaised },
  tabLabel: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 14 },
  tabLabelActive: { color: theme.colors.text },
  body: { flex: 1, paddingTop: 8 },
});
