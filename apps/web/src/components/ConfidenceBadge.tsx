const styles = {
  high:   'text-green-400 bg-green-500/10 border border-green-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20',
  low:    'text-red-400 bg-red-500/10 border border-red-500/20',
};

export function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[confidence]}`}>
      {confidence} confidence
    </span>
  );
}
