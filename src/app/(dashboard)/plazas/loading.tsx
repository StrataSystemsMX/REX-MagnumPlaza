export default function PlazasLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-56 rounded-lg bg-muted" />

      {/* Tabs */}
      <div className="flex gap-6 border-b">
        <div className="h-9 w-32 rounded bg-muted" />
        <div className="h-9 w-44 rounded bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-32 w-full rounded-lg bg-muted" />
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
