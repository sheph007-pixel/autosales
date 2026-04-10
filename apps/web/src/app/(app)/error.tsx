"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="bg-red-50 border border-red-200 rounded p-6">
        <h2 className="text-lg font-bold text-red-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-800 mb-1">
          <strong>Message:</strong> {error.message || "Unknown error"}
        </p>
        {error.digest && (
          <p className="text-xs text-red-700 mb-2">
            <strong>Digest:</strong> {error.digest}
          </p>
        )}
        {error.stack && (
          <details className="mt-3">
            <summary className="text-xs cursor-pointer text-red-800">Stack trace</summary>
            <pre className="text-[10px] mt-2 p-2 bg-red-100 rounded overflow-auto max-h-96">
              {error.stack}
            </pre>
          </details>
        )}
        <button
          onClick={() => reset()}
          className="mt-4 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
