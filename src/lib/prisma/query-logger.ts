/**
 * Instrumentación temporal: agrupa queries por request y detecta duplicados.
 *
 * Activar con `QSTATS=1 pnpm dev`. Envolver el cuerpo de cualquier page con
 * `withQueryStats(label, async () => { ...page body... })` para imprimir un
 * resumen a stdout al terminar de renderizar.
 *
 * Marcadores:
 *   ⚠ DUP   → la misma firma se ejecutó >1 vez en el mismo render.
 *   ⚠ NULL  → se mandó IN (NULL) — Prisma include con FK nulo, desperdicio.
 *   ⚠ BIG   → IN clause con >50 IDs — candidata a deduplicar en memoria.
 *
 * Quitar este archivo y el `$extends(queryStatsLogger)` del client cuando se
 * cierre el trabajo de cleanup de queries.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";

interface QueryEntry {
  model: string;
  operation: string;
  argSummary: string;
  ms: number;
}

const storage = new AsyncLocalStorage<QueryEntry[]>();

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const where = (args as Record<string, unknown>)["where"];
  if (!where || typeof where !== "object") return "";

  // Detecta IN clauses para identificar dedup oportunities y NULL leaks.
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      if (Array.isArray(inner["in"])) {
        const arr = inner["in"] as unknown[];
        if (arr.length === 0) return `${key} IN []`;
        if (arr.some((v) => v === null || v === undefined)) {
          return `${key} IN (NULL)`;
        }
        return `${key} IN [${arr.length}]`;
      }
    }
  }
  return Object.keys(where as Record<string, unknown>)
    .filter((k) => k !== "tenantId")
    .sort()
    .join(",");
}

export const queryStatsLogger = Prisma.defineExtension({
  name: "query-stats-logger",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const store = storage.getStore();
        if (!store) return query(args);
        const start = performance.now();
        try {
          return await query(args);
        } finally {
          store.push({
            model,
            operation,
            argSummary: summarizeArgs(args),
            ms: performance.now() - start,
          });
        }
      },
    },
  },
});

export async function withQueryStats<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (process.env["QSTATS"] !== "1") return fn();
  const entries: QueryEntry[] = [];
  try {
    return await storage.run(entries, fn);
  } finally {
    printSummary(label, entries);
  }
}

function printSummary(label: string, entries: QueryEntry[]): void {
  if (entries.length === 0) {
    console.log(`\n[QSTATS ${label}] (no queries)\n`);
    return;
  }

  const groups = new Map<string, { count: number; totalMs: number }>();
  let totalMs = 0;
  for (const e of entries) {
    const key = e.argSummary
      ? `${e.model}.${e.operation} (${e.argSummary})`
      : `${e.model}.${e.operation}`;
    const g = groups.get(key) ?? { count: 0, totalMs: 0 };
    g.count += 1;
    g.totalMs += e.ms;
    groups.set(key, g);
    totalMs += e.ms;
  }

  const sorted = Array.from(groups.entries()).sort(
    (a, b) => b[1].totalMs - a[1].totalMs,
  );

  console.log(
    `\n[QSTATS ${label}] ${entries.length} queries, ${Math.round(totalMs)}ms total`,
  );
  for (const [key, g] of sorted) {
    const flags: string[] = [];
    if (g.count > 1) flags.push("⚠ DUP");
    if (key.includes("IN (NULL)")) flags.push("⚠ NULL");
    const bigMatch = key.match(/IN \[(\d+)\]/);
    if (bigMatch && Number(bigMatch[1]) > 50) flags.push("⚠ BIG");
    const flagStr = flags.length > 0 ? `  ${flags.join(" ")}` : "";
    console.log(
      `  ${key.padEnd(70, " ")} ×${String(g.count).padStart(3)}  ${String(Math.round(g.totalMs)).padStart(5)}ms${flagStr}`,
    );
  }
  console.log("");
}
