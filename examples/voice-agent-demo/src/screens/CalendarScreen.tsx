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

  // Build the grid: leading blanks for the first-of-month weekday, then the days,
  // then trailing blanks to fill the last week. Chunked into rows of 7.
  const weeks = useMemo(() => {
    const firstDay = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const out: (number | null)[] = Array.from({ length: firstDay }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < out.length; i += 7) rows.push(out.slice(i, i + 7));
    return rows;
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
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((day, di) => {
              if (day === null) return <View key={`b${wi}-${di}`} style={styles.cell} />;
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
                  <View
                    style={[styles.dayCircle, isToday && styles.today, hasEntry && styles.hasEntry]}>
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
        ))}
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
  navText: { color: theme.colors.textMuted, fontSize: 22, fontWeight: '600', lineHeight: 26 },
  monthLabel: { color: theme.colors.text, fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  weekHeads: { flexDirection: 'row', marginBottom: 6 },
  weekHead: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  grid: {},
  week: { flexDirection: 'row' },
  cell: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: { borderWidth: 1, borderColor: theme.colors.gold },
  hasEntry: { backgroundColor: theme.colors.accentSoft },
  dayNum: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '500' },
  dayNumStrong: { color: theme.colors.text, fontWeight: '600' },
  futureNum: { color: theme.colors.textFaint },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: theme.colors.accent },
  legend: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 20 },
});
