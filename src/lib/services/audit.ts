import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { entityTypesForCategory, type AuditCategory } from "@/lib/audit/categories";
import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// =============================================================================
// Capa de auditoría (servidor)
// -----------------------------------------------------------------------------
// `logAudit` es el ÚNICO punto de escritura de auditoría: reúsalo desde
// cualquier servicio en vez de duplicar `prisma.auditLog.create`.
// `getAuditLog` alimenta la vista global del Historial de Cambios.
// =============================================================================

export interface LogAuditInput {
  tenantId: string;
  /** User interno (DB). `null` para acciones del sistema (crons). */
  userId: string | null;
  action: AuditAction;
  /** "Lessee", "Expense", "Payment", … (igual que el modelo Prisma). */
  entityType: string;
  entityId: string;
  changes?: Prisma.InputJsonValue | null;
}

/** Único punto de escritura de auditoría. */
export async function logAudit(input: LogAuditInput): Promise<void> {
  const { tenantId, userId, action, entityType, entityId, changes = null } = input;
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

// -----------------------------------------------------------------------------
// Consulta para el Historial de Cambios
// -----------------------------------------------------------------------------

export interface AuditLogFilters {
  category?: AuditCategory;
  action?: AuditAction;
  userId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes: Prisma.JsonValue | null;
  createdAt: Date;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const DEFAULT_PAGE_SIZE = 50;

/** Historial de cambios del tenant, paginado. */
export async function getAuditLog(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
  const { tenantId } = await requireAuth();

  const where: Prisma.AuditLogWhereInput = { tenantId };
  if (filters.category) {
    where.entityType = { in: entityTypesForCategory(filters.category) };
  }
  if (filters.action) where.action = filters.action;
  if (filters.userId) where.userId = filters.userId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Join de usuario manual: evitamos `include: { user }` porque cuando userId
  // es null Prisma aún dispara `SELECT users WHERE id IN (NULL)`.
  const userIds = Array.from(
    new Set(logs.map((l) => l.userId).filter((id): id is string => !!id)),
  );
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { tenantId, id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const entries: AuditLogEntry[] = logs.map((l) => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    changes: l.changes,
    createdAt: l.createdAt,
    userId: l.userId,
    user: l.userId ? (userMap.get(l.userId) ?? null) : null,
  }));

  return {
    entries,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
