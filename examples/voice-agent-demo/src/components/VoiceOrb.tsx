import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { theme } from '../theme';

type Props = {
  /** 0…1 audio level driving the pulse. */
  level: number;
  /** Orb accent — cyan while listening, pink while the agent speaks. */
  mode: 'listening' | 'speaking' | 'idle';
};

/** A microphone/agent activity orb that pulses with the live audio level. */
export function VoiceOrb({ level, mode }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1 + Math.min(level, 1) * 0.6,
      useNativeDriver: true,
      speed: 40,
      bounciness: 8,
    }).start();
  }, [level, scale]);

  const color =
    mode === 'speaking' ? theme.colors.pink : mode === 'listening' ? theme.colors.cyan : theme.colors.border;

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[styles.halo, { backgroundColor: color, opacity: 0.18, transform: [{ scale }] }]}
      />
      <View style={[styles.core, { borderColor: color, shadowColor: color }]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', height: 220 },
  halo: { position: 'absolute', width: 180, height: 180, borderRadius: 90 },
  core: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: { width: 44, height: 44, borderRadius: 22 },
});
