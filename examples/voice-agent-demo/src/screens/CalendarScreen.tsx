import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDreams } from '../context/DreamsContext';
import { theme } from '../theme';
import { dateKey, monthLabel } from '../types';

const WEEKDAY_HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Calendar view: a month grid with a dot on every day that has an entry. */
export function CalendarScreen({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { dreams } = useDreams();
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const todayKey = dateKey();

  const entryDays = useMemo(() => new Set(dreams.map((d) => d.date)), [dreams]);

  // Build the grid: leading blanks for the first-of-month weekday, then the days.
  const cells = useMemo(() => {
    const firstDay = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const out: (number | null)[] = Array.from({ length: firstDay }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  function shift(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  function keyFor(day: number): string {
    return `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={12} style={styles.nav}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(view.year, view.month)}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={12} style={styles.nav}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekHeads}>
        {WEEKDAY_HEADS.map((w, i) => (
          <Text key={i} style={styles.weekHead}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;
          const key = keyFor(day);
          const hasEntry = entryDays.has(key);
          const isToday = key === todayKey;
          const isFuture = key > todayKey;
          return (
            <Pressable
              key={key}
              style={styles.cell}
              disabled={isFuture}
              onPress={() => onOpenDay(key)}>
              <View style={[styles.dayCircle, isToday && styles.today, hasEntry && styles.hasEntry]}>
                <Text
                  style={[
                    styles.dayNum,
                    isFuture && styles.futureNum,
                    (isToday || hasEntry) && styles.dayNumStrong,
                  ]}>
                  {day}
                </Text>
              </View>
              <View style={[styles.dot, hasEntry ? styles.dotOn : undefined]} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.legend}>Tap a day to add or read that night’s dream.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  nav: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { color: theme.colors.text, fontSize: 24, fontWeight: '700', lineHeight: 28 },
  monthLabel: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  weekHeads: { flexDirection: 'row', marginBottom: 6 },
  weekHead: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: { borderWidth: 1.5, borderColor: theme.colors.cyan },
  hasEntry: { backgroundColor: 'rgba(243,42,145,0.18)' },
  dayNum: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
  dayNumStrong: { color: theme.colors.text, fontWeight: '700' },
  futureNum: { color: theme.colors.border },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: theme.colors.pink },
  legend: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 20 },
});
