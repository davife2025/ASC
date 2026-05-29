'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatusBadge } from '@/components/StatusBadge';
import type { Incident } from '@sre/types';

export default function HomePage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'triggered' | 'acknowledged' | 'resolved'>('all');

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.incidents.list(
        filter !== 'all' ? { status: filter } : undefined
      );
      setIncidents(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  async function syncIncidents() {
    setSyncing(true);
    try {
      await api.incidents.sync();
      await loadIncidents();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">SRE Investigator</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            AI-powered incident investigation · powered by Coral + Kimi K2
          </p>
        </div>
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
            'Sync from PagerDuty'
          )}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
        {(['all', 'triggered', 'acknowledged', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Stats */}
      <p className="text-gray-500 text-xs mb-4">{total} incident{total !== 1 ? 's' : ''}</p>

      {/* Incident list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-2">No incidents found</p>
          <p className="text-sm">Sync from PagerDuty to populate the feed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <Link
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="block bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{incident.title}</p>
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
