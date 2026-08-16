/**
 * Instrumentación temporal para diagnosticar latencia en páginas pesadas.
 * Loguea cada operación con su duración en ms a stdout del servidor.
 *
 * Uso:
 *   const [a, b] = await Promise.all([
 *     timed("getOutstandingRents", () => getOutstandingRents()),
 *     timed("getPayments", () => getPayments()),
 *   ]);
 *
 * Se desactiva en producción para no spammear logs. Quitar cuando termine el
 * trabajo de performance.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (process.env["NODE_ENV"] === "production" && process.env["PERF_LOG"] !== "1") return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[PERF] ${label}: ${ms}ms`);
  }
}

/** Variante síncrona para bloques que no son promesas. */
export function timedSync<T>(label: string, fn: () => T): T {
  if (process.env["NODE_ENV"] === "production" && process.env["PERF_LOG"] !== "1") return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[PERF] ${label}: ${ms}ms`);
  }
}
