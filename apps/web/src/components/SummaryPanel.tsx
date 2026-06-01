import type { IncidentSummary } from '@sre/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Timeline } from './Timeline';

export function SummaryPanel({ summary }: { summary: IncidentSummary }) {
  return (
    <div className="space-y-6">

      {/* Root Cause */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Root Cause</h3>
          <ConfidenceBadge confidence={summary.confidence} />
        </div>
        <p className="text-white text-base leading-relaxed bg-gray-800 rounded-lg p-3">
          {summary.root_cause}
        </p>
      </section>

      {/* Contributing Factors */}
      {summary.contributing_factors.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Contributing Factors</h3>
          <ul className="space-y-1">
            {summary.contributing_factors.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-orange-400 mt-0.5 shrink-0">›</span>{f}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Affected Services */}
      {summary.affected_services.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Affected Services</h3>
          <div className="flex flex-wrap gap-2">
            {summary.affected_services.map((s) => (
              <span key={s} className="text-xs font-mono bg-gray-800 text-gray-300 px-2 py-1 rounded">{s}</span>
            ))}
          </div>
        </section>
      )}

      {/* Recent Deploys */}
      {summary.recent_deploys.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Deploys</h3>
          <div className="space-y-2">
            {summary.recent_deploys.map((d, i) => {
              const hasUrl = typeof d.url === 'string' && d.url.startsWith('http');
              const inner = (
                <div className="bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm text-gray-200 font-medium">{d.message}</p>
                    <span className="text-xs text-gray-500 shrink-0 font-mono">{d.repo}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>{d.author}</span>
                    <span className="font-mono">{d.sha.slice(0, 7)}</span>
                    <span>{new Date(d.deployed_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
              return hasUrl
                ? <a key={i} href={d.url} target="_blank" rel="noreferrer" className="block">{inner}</a>
                : <div key={i}>{inner}</div>;
            })}
          </div>
        </section>
      )}

      {/* Grafana Anomalies */}
      {summary.grafana_anomalies.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Grafana Alerts</h3>
          <ul className="space-y-1">
            {summary.grafana_anomalies.map((a, i) => (
              <li key={i} className="text-sm text-orange-300 flex gap-2">
                <span className="text-orange-500 shrink-0">◆</span>{a}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Third-party Issues */}
      {summary.third_party_issues.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Third-party Issues</h3>
          <div className="space-y-2">
            {summary.third_party_issues.map((t, i) => (
              <div key={i} className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-300">{t.service}</span>
                  <span className="text-xs text-blue-400 capitalize">{t.status}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t.description}</p>
                <p className="text-xs text-gray-600 mt-1">Started {new Date(t.started_at).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Actions */}
      {summary.recommended_actions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Recommended Actions</h3>
          <ol className="space-y-2">
            {summary.recommended_actions.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-300">
                <span className="text-xs font-bold text-gray-600 mt-0.5 w-4 shrink-0 tabular-nums">{i + 1}.</span>
                {a}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Timeline */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Timeline</h3>
        <Timeline events={summary.timeline} />
      </section>

    </div>
  );
}
