export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-8">
      {/* Page title */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-40 rounded bg-muted" />
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-l-4 bg-card p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-7 w-16 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
