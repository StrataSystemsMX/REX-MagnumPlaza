/**
 * Aplica el catálogo de permisos (prisma/permissions-data.ts) sobre una base
 * EXISTENTE de forma idempotente: upsert de Permission y RolePermission.
 * No toca tenants ni datos operativos — a diferencia del seed completo, es
 * seguro correrlo contra producción tras agregar códigos nuevos.
 *
 * Uso: pnpm tsx prisma/sync-permissions.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { RoleCode } from "../src/generated/prisma/enums";
import { PERMISSIONS, ROLE_PERMISSION_CODES } from "./permissions-data";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definido. Copia .env.example a .env.local y configura la conexión.",
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: p,
    });
  }

  let assigned = 0;
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_CODES)) {
    const role = await prisma.role.findUnique({
      where: { code: roleCode as RoleCode },
    });
    if (!role) continue;
    for (const permCode of permCodes) {
      const perm = await prisma.permission.findUnique({ where: { code: permCode } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
      assigned += 1;
    }
  }

  console.log(
    `[sync-permissions] ${PERMISSIONS.length} permisos upserted, ${assigned} asignaciones de rol verificadas.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
