import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { theme } from '../theme';

// Per-bar responsiveness: center bars react hardest so a single audio level
// reads as an equalizer rather than five bars moving in lockstep.
const BARS = [0.55, 0.8, 1, 0.8, 0.55];
const IDLE = 0.22;

type Props = {
  /** 0…1 live input level; ignored unless `active`. */
  level: number;
  /** True while the mic is actually capturing. */
  active: boolean;
};

/** Five bars that pulse with the live mic level — the "it's hearing you" cue. */
export function DictationWave({ level, active }: Props) {
  const bars = useRef(BARS.map(() => new Animated.Value(IDLE))).current;

  useEffect(() => {
    bars.forEach((bar, i) => {
      const target = active ? Math.min(IDLE + level * BARS[i] * 1.6, 1) : IDLE;
      Animated.spring(bar, {
        toValue: target,
        useNativeDriver: true,
        speed: 30,
        bounciness: 6,
      }).start();
    });
  }, [level, active, bars]);

  return (
    <View style={styles.wave}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: active ? theme.colors.accent : theme.colors.textFaint,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 18 },
  bar: { width: 3, height: 18, borderRadius: 2 },
});
