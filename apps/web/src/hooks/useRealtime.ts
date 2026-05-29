'use client';

import { useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type Table = 'incidents' | 'investigations';
type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: Table;
  event?: Event;
  filter?: string;
  onchange: () => void;
}

export function useRealtime({
  table,
  event = '*',
  filter,
  onchange,
}: UseRealtimeOptions) {
  const onchangeRef = useRef(onchange);
  onchangeRef.current = onchange;

  // FIX: stable channel name — only changes when table/event/filter changes,
  // not on every render (was using Math.random() before)
  const channelName = useMemo(
    () => `rt:${table}:${event}:${filter ?? 'all'}`,
    [table, event, filter],
  );

  useEffect(() => {
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        () => onchangeRef.current(),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime] channel error on ${channelName}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, event, filter, table]);
}
