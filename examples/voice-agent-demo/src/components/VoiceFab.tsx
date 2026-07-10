import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../theme';

/** Floating mic button — the always-available entry point to the voice companion. */
export function VoiceFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      accessibilityLabel="Talk to your dream companion">
      <Text style={styles.icon}>🎙</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: theme.colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.pink,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  icon: { fontSize: 26 },
});
