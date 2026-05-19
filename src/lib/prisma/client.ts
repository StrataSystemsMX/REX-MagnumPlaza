import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { queryStatsLogger } from "./query-logger";
import { tenantIsolation } from "./tenant-middleware";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definido. Copia .env.example a .env.local y configura la conexión.",
  );
}

// Singleton: en dev, Next.js recarga módulos en HMR. Sin esto crearíamos una
// nueva PrismaClient (con su propio pool) en cada recarga y eventualmente
// agotaríamos el pool de Postgres.
const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

function createBaseClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  // Log de queries en dev (o en prod si PERF_LOG=1) para medir latencia DB.
  // Quitar al cerrar el trabajo de performance.
  const shouldLog =
    process.env["NODE_ENV"] !== "production" || process.env["PERF_LOG"] === "1";
  const log = shouldLog
    ? ([{ emit: "stdout", level: "query" }] as const)
    : undefined;
  return new PrismaClient({ adapter, ...(log ? { log: [...log] } : {}) });
}

const baseClient: PrismaClient = globalForPrisma.prismaBase ?? createBaseClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prismaBase = baseClient;
}

/**
 * Cliente principal con el guardrail multi-tenant aplicado.
 *
 * USAR EN TODO CÓDIGO DE FEATURE. Si una query tenant-scoped no pasa tenantId
 * explícito, la extensión revienta loud antes de tocar la base. Ver
 * `tenant-middleware.ts`.
 */
export const prisma = baseClient
  .$extends(tenantIsolation)
  .$extends(queryStatsLogger);

/**
 * Cliente sin el guardrail multi-tenant. Solo para casos legítimamente
 * globales donde aún no tenemos `tenantId`:
 *
 *   - Bootstrap de auth: buscar/crear el User a partir del clerkId del
 *     request (todavía no sabemos su tenant).
 *
 * NUNCA importar este cliente desde código de feature. Si crees que lo
 * necesitas, lee CLAUDE.md §4.1 primero.
 */
export const prismaUnsafe: PrismaClient = baseClient;
