export default function ContractDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-8 w-72 rounded-lg bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-md bg-muted" />
          <div className="h-9 w-28 rounded-md bg-muted" />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-7 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded bg-muted" />
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="ml-auto h-4 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
