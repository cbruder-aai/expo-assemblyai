import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Dream } from '../types';

const KEY = 'dream-journal.dreams.v1';

/** Load all dreams, newest day first. Returns [] on first run or parse failure. */
export async function loadDreams(): Promise<Dream[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Dream[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Persist the full list (newest first). */
export async function saveDreams(dreams: Dream[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(dreams));
}
