const incidentStyles: Record<string, string> = {
  triggered:    'bg-red-500/20 text-red-300',
  acknowledged: 'bg-yellow-500/20 text-yellow-300',
  resolved:     'bg-green-500/20 text-green-300',
};

const investigationStyles: Record<string, string> = {
  pending:  'bg-gray-500/20 text-gray-400',
  running:  'bg-blue-500/20 text-blue-300',
  complete: 'bg-green-500/20 text-green-300',
  failed:   'bg-red-500/20 text-red-400',
};

export function StatusBadge({
  status,
  type = 'incident',
}: {
  status: string;
  type?: 'incident' | 'investigation';
}) {
  const map = type === 'incident' ? incidentStyles : investigationStyles;
  const cls = map[status] ?? 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {status === 'running' ? (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
          {status}
        </span>
      ) : (
        status
      )}
    </span>
  );
}
