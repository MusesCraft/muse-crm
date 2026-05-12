'use client';
import { useState, useCallback } from 'react';

interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return Object.fromEntries(columns.map(c => [c.key, c.defaultVisible !== false]));
  });

  const toggle = useCallback((key: string) => {
    setVisible(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);

  const isVisible = useCallback((key: string) => visible[key] !== false, [visible]);

  return { visible, toggle, isVisible };
}
