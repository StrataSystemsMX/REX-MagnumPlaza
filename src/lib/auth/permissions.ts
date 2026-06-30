import { prisma } from "@/lib/prisma/client";
import type { RoleCode } from "@/generated/prisma/enums";

/**
 * ¿El user (en nuestra DB) tiene este permission code asignado vía algún rol?
 *
 * Convenio: el rol MASTER (Juan Carlos) tiene acceso total por definición.
 * No requiere RolePermission. Permission/RolePermission se usan para roles
 * con acceso parcial (ADMIN, ACCOUNTANT, ...) cuando los introduzcamos.
 *
 * Roles, RolePermission y Permission son globales (sin tenantId), así que
 * la query pasa por el guardrail multi-tenant sin escándalo.
 */
export async function hasPermission(
  dbUserId: string,
  permissionCode: string,
): Promise<boolean> {
  const isMaster = await prisma.userRole.findFirst({
    where: { userId: dbUserId, role: { code: "MASTER" } },
    select: { userId: true },
  });
  if (isMaster) return true;

  const match = await prisma.userRole.findFirst({
    where: {
      userId: dbUserId,
      role: {
        permissions: {
          some: { permission: { code: permissionCode } },
        },
      },
    },
    select: { userId: true },
  });
  return match !== null;
}

export async function requirePermission(
  dbUserId: string,
  permissionCode: string,
): Promise<void> {
  const ok = await hasPermission(dbUserId, permissionCode);
  if (!ok) {
    throw new PermissionError(permissionCode);
  }
}

/**
 * ¿El user es MASTER? Útil para mostrar/ocultar acciones críticas en UI
 * (borrar pagos, exportar fiscal, etc.).
 */
export async function isMaster(dbUserId: string): Promise<boolean> {
  const match = await prisma.userRole.findFirst({
    where: { userId: dbUserId, role: { code: "MASTER" } },
    select: { userId: true },
  });
  return match !== null;
}

/** Códigos de roles del usuario. Útil para gating de UI por rol múltiple. */
export async function getUserRoleCodes(dbUserId: string): Promise<RoleCode[]> {
  const rows = await prisma.userRole.findMany({
    where: { userId: dbUserId },
    select: { role: { select: { code: true } } },
  });
  return rows.map((r) => r.role.code);
}

export class PermissionError extends Error {
  readonly code: string;
  constructor(permissionCode: string) {
    super(`Permiso requerido: ${permissionCode}`);
    this.name = "PermissionError";
    this.code = permissionCode;
  }
}

// ============================================================================
// Acceso al Historial de Cambios (auditoría)
// ----------------------------------------------------------------------------
// Ver y deshacer cambios queda restringido a MASTER/ADMIN. Hoy el gate es por
// rol; los códigos `audit.view` / `audit.restore` quedan reservados para cuando
// se siembren permisos por rol (ver hasPermission).
// ============================================================================

/** ¿Puede ver y operar el historial de cambios? (MASTER o ADMIN.) */
export async function canAccessAudit(dbUserId: string): Promise<boolean> {
  if (await isMaster(dbUserId)) return true;
  const codes = await getUserRoleCodes(dbUserId);
  return codes.includes("ADMIN");
}

export async function requireAuditView(dbUserId: string): Promise<void> {
  if (!(await canAccessAudit(dbUserId))) {
    throw new PermissionError("audit.view");
  }
}

export async function requireAuditRestore(dbUserId: string): Promise<void> {
  if (!(await canAccessAudit(dbUserId))) {
    throw new PermissionError("audit.restore");
  }
}
