import type { TimelineEvent } from '@sre/types';

const sourceColors: Record<TimelineEvent['source'], string> = {
  pagerduty:  'bg-green-500',
  grafana:    'bg-orange-500',
  github:     'bg-gray-400',
  statusgator:'bg-blue-500',
};

const sourceLabels: Record<TimelineEvent['source'], string> = {
  pagerduty:   'PD',
  grafana:     'GR',
  github:      'GH',
  statusgator: 'SG',
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-gray-500 text-sm">No timeline events.</p>;

  return (
    <ol className="relative border-l border-gray-700 space-y-4 ml-2">
      {events.map((ev, i) => (
        <li key={i} className="ml-6">
          <span
            className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white ${sourceColors[ev.source]}`}
          >
            {sourceLabels[ev.source]}
          </span>
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <time className="text-xs text-gray-500">
              {new Date(ev.timestamp).toLocaleTimeString()}
            </time>
            <p className="text-sm text-gray-200 mt-0.5">{ev.event}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
