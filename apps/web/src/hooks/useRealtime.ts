'use client';

import { useEffect, useRef } from 'react';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Table = 'incidents' | 'investigations';
type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: Table;
  event?: Event;
  filter?: string; // e.g. "incident_id=eq.some-uuid"
  onchange: () => void;
}

export function useRealtime({ table, event = '*', filter, onchange }: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onchangeRef = useRef(onchange);
  onchangeRef.current = onchange;

  useEffect(() => {
    const channelName = `${table}-${event}-${filter ?? 'all'}-${Math.random()}`;

    const config: Parameters<typeof supabase.channel>[1] = {};
    const channel = supabase.channel(channelName, config);

    const postgresConfig: Record<string, string> = {
      event,
      schema: 'public',
      table,
    };
    if (filter) postgresConfig.filter = filter;

    channel
      .on('postgres_changes' as Parameters<typeof channel.on>[0], postgresConfig as Parameters<typeof channel.on>[1], () => {
        onchangeRef.current();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, filter]);
}
