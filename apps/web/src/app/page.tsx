'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/useRealtime';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { IncidentCardSkeleton } from '@/components/Skeletons';
import type { Incident } from '@sre/types';

type Filter = 'all' | 'triggered' | 'acknowledged' | 'resolved';

const FILTERS: Filter[] = ['all', 'triggered', 'acknowledged', 'resolved'];

export default function HomePage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    try {
      const res = await api.incidents.list(filter !== 'all' ? { status: filter } : undefined);
      setIncidents(res.data);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadIncidents();
  }, [loadIncidents]);

  // Realtime — re-fetch on any incident change
  useRealtime({ table: 'incidents', onchange: loadIncidents });

  async function syncIncidents() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await api.incidents.sync();
      setSyncMsg(`Synced ${res.data.synced} incident(s)`);
      setTimeout(() => setSyncMsg(null), 3000);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Incidents</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live feed · realtime updates</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-gray-400 bg-gray-800 px-3 py-1.5 rounded-lg">
              {syncMsg}
            </span>
          )}
          <button
            onClick={syncIncidents}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {syncing ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Syncing…
              </>
            ) : (
              'Sync PagerDuty'
            )}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 p-1 rounded-lg w-fit border border-gray-800">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <p className="text-gray-600 text-xs mb-4">{total} incident{total !== 1 ? 's' : ''}</p>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <IncidentCardSkeleton key={i} />)}
        </div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
          <p className="text-gray-400 font-medium mb-1">No incidents</p>
          <p className="text-gray-600 text-sm">
            {filter !== 'all'
              ? `No ${filter} incidents. Try a different filter.`
              : 'Sync from PagerDuty to populate the feed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <Link
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="block bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white font-medium truncate group-hover:text-blue-300 transition-colors">
                    {incident.title}
                  </p>
                  <p className="text-gray-500 text-sm mt-0.5">{incident.service_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SeverityBadge severity={incident.severity} />
                  <StatusBadge status={incident.status} />
                </div>
              </div>
              <div className="flex gap-4 mt-3 text-xs text-gray-600">
                <span>{new Date(incident.created_at).toLocaleString()}</span>
                {incident.assigned_to && <span>→ {incident.assigned_to}</span>}
                {incident.resolved_at && (
                  <span className="text-green-600">
                    resolved {new Date(incident.resolved_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
