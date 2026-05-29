'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function IncidentError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-6 inline-block">
        ← All incidents
      </Link>
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400 font-medium mb-1">Failed to load incident</p>
        <p className="text-gray-500 text-sm mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
