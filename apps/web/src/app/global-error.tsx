'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html>
      <body className="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-red-400 text-sm font-mono mb-2">Something went wrong</p>
          <p className="text-gray-500 text-sm mb-6">{error.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
