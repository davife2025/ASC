'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type Table = 'incidents' | 'investigations';
type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: Table;
  event?: Event;
  filter?: string; // e.g. "incident_id=eq.some-uuid"
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

  useEffect(() => {
    const channelName = [table, event, filter ?? 'all', String(Math.random())].join('-');

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
        () => onchangeRef.current()
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime] channel error on ${table}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, filter]);
}
