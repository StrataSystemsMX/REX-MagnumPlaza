import { headers } from "next/headers";

/**
 * Rate limiter en memoria con ventana deslizante. Best-effort: el estado vive
 * por instancia del servidor (en Vercel Fluid Compute las instancias se
 * reutilizan entre requests, así que sí mitiga ráfagas reales). Para límites
 * duros cross-instancia, la capa que llame debe complementar con un conteo en
 * DB (ver actionCaptureLead).
 */

const buckets = new Map<string, number[]>();

// Tope de llaves vivas para que un atacante no infle la memoria con IPs falsas.
const MAX_KEYS = 10_000;

/**
 * Registra un hit para `key` y devuelve `true` si sigue dentro del límite
 * (`limit` hits por `windowMs`). Devuelve `false` si se excedió.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (buckets.size >= MAX_KEYS && !buckets.has(key)) {
    // Poda global: elimina llaves cuya ventana ya expiró.
    for (const [k, hits] of buckets) {
      if (hits.every((t) => t <= cutoff)) buckets.delete(k);
    }
    // Si aun así está lleno, fail-closed para llaves nuevas.
    if (buckets.size >= MAX_KEYS) return false;
  }

  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Visible solo para tests. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * IP del cliente del request actual (Vercel/proxies estándar). "unknown" si no
 * hay header — esas requests comparten bucket, lo cual es deliberadamente
 * conservador.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
