import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../theme';

const BAR_HEIGHTS = [10, 20, 14, 24, 12];

/** Floating voice button — the always-available entry point to the voice companion. */
export function VoiceFab({ onPress }: { onPress: () => void }) {
  // Absolutely positioned, so the parent SafeAreaView's inset doesn't apply —
  // offset past the Android gesture nav bar (and iOS home indicator) ourselves.
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom: 24 + insets.bottom }, pressed && { opacity: 0.85 }]}
      accessibilityLabel="Talk to your dream companion">
      <View style={styles.wave}>
        {BAR_HEIGHTS.map((h, i) => (
          <View key={i} style={[styles.bar, { height: h }]} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 3.5, borderRadius: 2, backgroundColor: theme.colors.ink },
});
