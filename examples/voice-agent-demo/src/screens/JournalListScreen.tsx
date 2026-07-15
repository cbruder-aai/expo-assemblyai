import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDreams } from '../context/DreamsContext';
import { theme } from '../theme';
import { dateKey, formatShort, relativeLabel, type Dream } from '../types';

/** List view: every recorded dream, newest first. Tap one to edit. */
export function JournalListScreen({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { dreams, loaded } = useDreams();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.heading}>Your dreams</Text>
        <Pressable style={styles.newBtn} onPress={() => onOpenDay(dateKey())} hitSlop={8}>
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        data={dreams}
        keyExtractor={(d) => d.id}
        contentContainerStyle={dreams.length ? styles.list : styles.emptyWrap}
        renderItem={({ item }) => <Row dream={item} onPress={() => onOpenDay(item.date)} />}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No dreams yet</Text>
              <Text style={styles.emptyBody}>
                Tap “+ New” to record last night’s dream — type it or dictate it with your voice.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function Row({ dream, onPress }: { dream: Dream; onPress: () => void }) {
  const rel = relativeLabel(dream.date);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowDate}>{formatShort(dream.date)}</Text>
        {rel ? <Text style={styles.rowRel}>{rel}</Text> : null}
      </View>
      <Text style={styles.rowText} numberOfLines={3}>
        {dream.text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  heading: { color: theme.colors.text, fontSize: 21, fontWeight: '700', letterSpacing: 0.2 },
  newBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentSoft,
  },
  newBtnText: { color: theme.colors.accent, fontWeight: '600', fontSize: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 120, gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 40 },
  row: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  rowDate: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  rowRel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  rowText: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 },
  empty: { alignItems: 'center' },
  emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
