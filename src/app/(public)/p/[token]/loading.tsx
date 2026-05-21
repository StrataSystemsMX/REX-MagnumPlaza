export default function Loading() {
  return (
    <article className="mx-auto flex max-w-3xl animate-pulse flex-col gap-4 pb-24 sm:gap-6">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="h-12 border-b bg-muted" />
        <div className="aspect-[4/3] w-full bg-muted sm:aspect-[16/9]" />
        <div className="space-y-2 p-4">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-6 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="h-40 rounded-xl border bg-card" />
      <div className="h-72 rounded-xl border bg-card" />
    </article>
  );
}
