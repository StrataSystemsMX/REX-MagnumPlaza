export default function LesseesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-muted" />
        <div className="h-9 w-36 rounded-md bg-muted" />
      </div>

      <div className="flex gap-3">
        <div className="h-9 w-64 rounded-md bg-muted" />
        <div className="h-9 w-40 rounded-md bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
