'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Advisor } from './types';

export function useAdvisors() {
  return useQuery({ queryKey: ['users'], queryFn: () => api<Advisor[]>('/users'), staleTime: 5 * 60_000 });
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
