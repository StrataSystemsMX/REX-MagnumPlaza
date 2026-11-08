/**
 * Aplica el catálogo global de roles y permisos (prisma/permissions-data.ts)
 * de forma idempotente: upsert de Role, Permission y RolePermission. Lo usan
 * el seed, sync-permissions y bootstrap-production.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import type { RoleCode } from "../src/generated/prisma/enums";
import { PERMISSIONS, ROLES, ROLE_PERMISSION_CODES } from "./permissions-data";

export async function syncRolesAndPermissions(
  prisma: PrismaClient,
): Promise<{ roles: number; permissions: number; assignments: number }> {
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
  }

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: p,
    });
  }

  // Sin estas filas solo MASTER pasa hasPermission (hace bypass) y cualquier
  // ADMIN/ACCOUNTANT/OWNER falla toda acción protegida.
  let assignments = 0;
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
      assignments += 1;
    }
  }

  return { roles: ROLES.length, permissions: PERMISSIONS.length, assignments };
}
