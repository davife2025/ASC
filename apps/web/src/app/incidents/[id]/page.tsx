'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/useRealtime';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryPanel } from '@/components/SummaryPanel';
import { PageSkeleton } from '@/components/Skeletons';
import type { Incident, Investigation } from '@sre/types';

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();

  const [incident,     setIncident]     = useState<Incident | null>(null);
  const [investigation,setInvestigation]= useState<Investigation | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [triggering,   setTriggering]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [incRes, invRes] = await Promise.all([
        api.incidents.get(id),
        api.investigations.list({ incident_id: id }),
      ]);
      setIncident(incRes.data);
      setInvestigation(invRes.data[0] ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  useRealtime({ table: 'investigations', filter: `incident_id=eq.${id}`, onchange: loadData });

  async function triggerInvestigation() {
    setTriggering(true);
    try {
      const res = await api.investigations.trigger(id);
      setInvestigation(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start investigation');
    } finally {
      setTriggering(false);
    }
  }

  async function retryInvestigation() {
    if (!investigation) return;
    try {
      await api.investigations.retry(investigation.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    }
  }

  if (loading) return <PageSkeleton />;

  if (error && !incident) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-6 inline-block">← All incidents</Link>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400 font-medium mb-1">Failed to load incident</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">Retry</button>
        </div>
      </main>
    );
  }

  if (!incident) return null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-6 inline-block">← All incidents</Link>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-xl font-bold text-white leading-snug">{incident.title}</h1>
        <div className="flex gap-2 shrink-0">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-8">
        <span className="font-medium text-gray-400">{incident.service_name}</span>
        <span>{new Date(incident.created_at).toLocaleString()}</span>
        {incident.assigned_to && <span>→ {incident.assigned_to}</span>}
        {incident.resolved_at && (
          <span className="text-green-500">resolved {new Date(incident.resolved_at).toLocaleString()}</span>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm text-red-400 flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">Investigation</h2>
            {investigation && <StatusBadge status={investigation.status} type="investigation" />}
            {investigation?.completed_at && (
              <span className="text-xs text-gray-600">{new Date(investigation.completed_at).toLocaleTimeString()}</span>
            )}
          </div>
          <div className="flex gap-2">
            {!investigation && (
              <button onClick={triggerInvestigation} disabled={triggering}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {triggering ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Starting…</> : 'Investigate'}
              </button>
            )}
            {investigation?.status === 'failed' && (
              <button onClick={retryInvestigation} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Retry</button>
            )}
            {investigation?.status === 'complete' && (
              <button onClick={triggerInvestigation} disabled={triggering} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">Re-investigate</button>
            )}
          </div>
        </div>

        {!investigation && (
          <div className="text-center py-10 border border-dashed border-gray-800 rounded-lg">
            <p className="text-gray-400 font-medium mb-1">No investigation yet</p>
            <p className="text-gray-600 text-sm">Click Investigate to correlate PagerDuty · Grafana · GitHub · StatusGator</p>
          </div>
        )}

        {investigation?.status === 'pending' && (
          <div className="flex items-center gap-3 text-gray-400 text-sm py-6">
            <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin shrink-0" />
            Queued — waiting for agent worker…
          </div>
        )}

        {investigation?.status === 'running' && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 text-blue-300 text-sm">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              Fetching from Coral sources…
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {(['PagerDuty', 'Grafana', 'GitHub', 'StatusGator'] as const).map((src) => (
                <div key={src} className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-gray-400">{src}</span>
                </div>
              ))}
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full animate-pulse w-3/4" />
            </div>
            <p className="text-xs text-gray-600">Kimi K2 is analysing the correlation…</p>
          </div>
        )}

        {investigation?.status === 'failed' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <p className="text-red-400 text-sm font-medium mb-1">Investigation failed</p>
            <p className="text-gray-500 text-xs font-mono">{investigation.error ?? 'Unknown error'}</p>
          </div>
        )}

        {investigation?.status === 'complete' && investigation.summary && (
          <SummaryPanel summary={investigation.summary} />
        )}
      </div>

      {investigation && (
        <p className="text-xs text-gray-700 mt-4 text-center">
          Data via Coral · PagerDuty · Grafana · GitHub · StatusGator · Analysis by Kimi K2
        </p>
      )}
    </main>
  );
}
