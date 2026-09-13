export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 animate-pulse rounded bg-surface-3" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-3" />)}</div>
      <div className="h-64 animate-pulse rounded-lg bg-surface-3" />
    </div>
  );
}
