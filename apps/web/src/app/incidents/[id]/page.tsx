'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryPanel } from '@/components/SummaryPanel';
import type { Incident, Investigation } from '@sre/types';

const POLL_MS = 4_000;

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const loadData = useCallback(async () => {
    const [incRes, invRes] = await Promise.allSettled([
      api.incidents.get(id),
      api.investigations.list({ incident_id: id, status: undefined }),
    ]);

    if (incRes.status === 'fulfilled') setIncident(incRes.value.data);
    if (invRes.status === 'fulfilled') {
      const latest = invRes.value.data[0] ?? null;
      setInvestigation(latest);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll while investigation is running/pending
  useEffect(() => {
    if (!investigation || !['pending', 'running'].includes(investigation.status)) return;
    const t = setInterval(loadData, POLL_MS);
    return () => clearInterval(t);
  }, [investigation, loadData]);

  async function triggerInvestigation() {
    setTriggering(true);
    try {
      const res = await api.investigations.trigger(id);
      setInvestigation(res.data);
    } finally {
      setTriggering(false);
    }
  }

  async function retryInvestigation() {
    if (!investigation) return;
    await api.investigations.retry(investigation.id);
    await loadData();
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-800 rounded w-2/3" />
          <div className="h-4 bg-gray-800 rounded w-1/3" />
          <div className="h-64 bg-gray-800 rounded-xl mt-8" />
        </div>
      </main>
    );
  }

  if (!incident) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-400">
        Incident not found.{' '}
        <Link href="/" className="text-blue-400 hover:underline">Go back</Link>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-6 inline-block">
        ← All incidents
      </Link>

      {/* Incident header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-xl font-bold text-white leading-snug">{incident.title}</h1>
        <div className="flex gap-2 shrink-0">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
      </div>

      <div className="flex gap-4 text-sm text-gray-500 mb-8">
        <span>{incident.service_name}</span>
        <span>{new Date(incident.created_at).toLocaleString()}</span>
        {incident.assigned_to && <span>→ {incident.assigned_to}</span>}
      </div>

      {/* Investigation panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">Investigation</h2>
            {investigation && (
              <StatusBadge status={investigation.status} type="investigation" />
            )}
          </div>

          {!investigation && (
            <button
              onClick={triggerInvestigation}
              disabled={triggering}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {triggering ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting…
                </>
              ) : (
                'Investigate'
              )}
            </button>
          )}

          {investigation?.status === 'failed' && (
            <button
              onClick={retryInvestigation}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
        </div>

        {/* States */}
        {!investigation && (
          <p className="text-gray-500 text-sm">
            No investigation yet. Click Investigate to start an AI-powered analysis.
          </p>
        )}

        {investigation?.status === 'pending' && (
          <div className="flex items-center gap-3 text-gray-400 text-sm">
            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Queued — waiting for agent…
          </div>
        )}

        {investigation?.status === 'running' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-blue-300 text-sm">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Fetching from Coral (PagerDuty · Datadog · GitHub · StatusGator)…
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {investigation?.status === 'failed' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
            Investigation failed: {investigation.error ?? 'Unknown error'}
          </div>
        )}

        {investigation?.status === 'complete' && investigation.summary && (
          <SummaryPanel summary={investigation.summary} />
        )}
      </div>
    </main>
  );
}
