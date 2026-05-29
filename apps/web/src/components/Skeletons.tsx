export function IncidentCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-800 rounded w-3/4" />
          <div className="h-3 bg-gray-800 rounded w-1/3" />
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-14 bg-gray-800 rounded-full" />
          <div className="h-5 w-20 bg-gray-800 rounded-full" />
        </div>
      </div>
      <div className="h-3 bg-gray-800 rounded w-1/4 mt-3" />
    </div>
  );
}

export function InvestigationSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-1/2" />
      <div className="h-3 bg-gray-800 rounded w-full" />
      <div className="h-3 bg-gray-800 rounded w-4/5" />
      <div className="h-3 bg-gray-800 rounded w-2/3" />
      <div className="h-24 bg-gray-800 rounded-lg mt-4" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4 animate-pulse">
      <div className="h-7 bg-gray-800 rounded w-2/3" />
      <div className="h-4 bg-gray-800 rounded w-1/4" />
      <div className="h-64 bg-gray-900 border border-gray-800 rounded-xl mt-8" />
    </div>
  );
}
