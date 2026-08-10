import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";
import type { MaintenanceStatus, MaintenanceType } from "@/generated/prisma/enums";

export interface MaintenanceFilters {
  propertyId?: string;
  status?: MaintenanceStatus;
  type?: MaintenanceType;
}

export async function getMaintenances(filters: MaintenanceFilters = {}) {
  const { tenantId } = await requireAuth();

  const rows = await prisma.maintenance.findMany({
    where: {
      tenantId,
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    },
    orderBy: [{ status: "asc" }, { scheduledDate: "asc" }, { createdAt: "desc" }],
    include: {
      property: { select: { id: true, name: true, type: true } },
      unit: { select: { id: true, code: true, name: true } },
      documents: {
        where: { type: "MAINTENANCE_PHOTO" },
        orderBy: { createdAt: "desc" },
        select: { id: true, url: true, filename: true, mimeType: true },
      },
    },
  });

  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    status: m.status,
    responsibility: m.responsibility,
    scheduledDate: m.scheduledDate,
    completedDate: m.completedDate,
    cost: m.cost?.toNumber() ?? null,
    vendor: m.vendor,
    isRecurring: m.isRecurring,
    notes: m.notes,
    createdAt: m.createdAt,
    property: m.property,
    unit: m.unit,
    documents: m.documents,
    // Los mantenimientos generados desde el cierre de una fianza llevan el
    // marcador `[deposit:<guaranteeId>]` en `notes`.
    source: (m.notes?.includes("[deposit:") ? "deposit" : "manual") as
      | "deposit"
      | "manual",
  }));
}

export type MaintenanceRow = Awaited<ReturnType<typeof getMaintenances>>[number];

export async function getMaintenanceSummary() {
  const { tenantId } = await requireAuth();

  const [planned, inProgress, completed, overdue] = await Promise.all([
    prisma.maintenance.count({ where: { tenantId, status: "PLANNED" } }),
    prisma.maintenance.count({ where: { tenantId, status: "IN_PROGRESS" } }),
    prisma.maintenance.count({ where: { tenantId, status: "COMPLETED" } }),
    prisma.maintenance.count({ where: { tenantId, status: "OVERDUE" } }),
  ]);

  const totalCostResult = await prisma.maintenance.aggregate({
    where: { tenantId, status: "COMPLETED" },
    _sum: { cost: true },
  });

  return {
    planned,
    inProgress,
    completed,
    overdue,
    totalCompletedCost: totalCostResult._sum.cost?.toNumber() ?? 0,
  };
}

export async function getPropertiesForMaintenanceForm() {
  const { tenantId } = await requireAuth();
  return prisma.property.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      units: {
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      },
    },
  });
}

export type PropertyForMaintenance = Awaited<
  ReturnType<typeof getPropertiesForMaintenanceForm>
>[number];
