/**
 * Skeleton genérico para el fallback de Suspense (loading.tsx) de las páginas
 * del dashboard: encabezado + KPIs + tabla. Los segmentos con estructura muy
 * particular (collections, contracts) mantienen su skeleton propio.
 */
export function PageSkeleton({
  kpis = 3,
  rows = 8,
}: {
  kpis?: number;
  rows?: number;
}) {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-muted" />
        <div className="h-9 w-32 rounded-md bg-muted" />
      </div>

      {kpis > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-8 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="ml-auto h-4 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
