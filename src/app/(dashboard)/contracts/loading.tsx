export default function ContractsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="h-9 w-36 rounded-md bg-muted" />
      </div>

      <div className="flex gap-3">
        <div className="h-9 w-64 rounded-md bg-muted" />
        <div className="h-9 w-44 rounded-md bg-muted" />
        <div className="h-9 w-52 rounded-md bg-muted" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-6 py-3">
          <div className="h-4 w-40 rounded bg-muted" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="ml-auto h-5 w-20 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
