/**
 * Aplica el catálogo de roles y permisos (prisma/permissions-data.ts) sobre
 * una base EXISTENTE de forma idempotente: upsert de Role, Permission y
 * RolePermission. No toca tenants ni datos operativos — a diferencia del seed
 * completo, es seguro correrlo contra producción tras agregar códigos nuevos.
 *
 * Uso: pnpm db:sync-permissions
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { syncRolesAndPermissions } from "./catalog-sync";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definido. Copia .env.example a .env.local y configura la conexión.",
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const { roles, permissions, assignments } = await syncRolesAndPermissions(prisma);
  console.log(
    `[sync-permissions] ${roles} roles y ${permissions} permisos upserted, ${assignments} asignaciones de rol verificadas.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
