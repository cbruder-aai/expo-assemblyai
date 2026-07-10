import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { loadDreams, saveDreams } from '../storage/dreams';
import type { Dream } from '../types';

type DreamsContextValue = {
  dreams: Dream[];
  loaded: boolean;
  /** Look up the single entry for a `YYYY-MM-DD` day, if any. */
  getByDate: (date: string) => Dream | undefined;
  /** Create or update the entry for a day. Empty text deletes the entry. */
  upsert: (date: string, text: string) => void;
  remove: (date: string) => void;
};

const DreamsContext = createContext<DreamsContextValue | null>(null);

export function DreamsProvider({ children }: { children: React.ReactNode }) {
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadDreams().then((d) => {
      if (active) {
        setDreams(d);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist whenever the list changes (after the initial load).
  useEffect(() => {
    if (loaded) void saveDreams(dreams);
  }, [dreams, loaded]);

  const getByDate = useCallback(
    (date: string) => dreams.find((d) => d.date === date),
    [dreams]
  );

  const upsert = useCallback((date: string, text: string) => {
    const trimmed = text.trim();
    setDreams((prev) => {
      const existing = prev.find((d) => d.date === date);
      if (!trimmed) {
        // Clearing the text removes the entry entirely.
        return existing ? prev.filter((d) => d.date !== date) : prev;
      }
      const now = Date.now();
      const next = existing
        ? prev.map((d) => (d.date === date ? { ...d, text: trimmed, updatedAt: now } : d))
        : [...prev, { id: date, date, text: trimmed, createdAt: now, updatedAt: now }];
      return next.slice().sort((a, b) => b.date.localeCompare(a.date));
    });
  }, []);

  const remove = useCallback((date: string) => {
    setDreams((prev) => prev.filter((d) => d.date !== date));
  }, []);

  const value = useMemo(
    () => ({ dreams, loaded, getByDate, upsert, remove }),
    [dreams, loaded, getByDate, upsert, remove]
  );

  return <DreamsContext.Provider value={value}>{children}</DreamsContext.Provider>;
}

export function useDreams(): DreamsContextValue {
  const ctx = useContext(DreamsContext);
  if (!ctx) throw new Error('useDreams must be used within a DreamsProvider');
  return ctx;
}
