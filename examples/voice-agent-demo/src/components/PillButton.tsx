import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function PillButton({ label, onPress, variant = 'primary', loading, disabled }: Props) {
  const bg =
    variant === 'danger'
      ? theme.colors.danger
      : variant === 'ghost'
        ? 'transparent'
        : theme.colors.pink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.ghost,
      ]}>
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text style={[styles.label, variant === 'ghost' && { color: theme.colors.textMuted }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 200,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { borderWidth: 1, borderColor: theme.colors.border, minWidth: 0 },
  label: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
});
