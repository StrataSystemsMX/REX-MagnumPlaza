import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";

export type CadastralStatus =
  | "PAID"
  | "DUE"
  | "OVERDUE"
  | "PAID_BY_THIRD_PARTY";

export interface CadastralListFilters {
  year?: number;
  ownerEntityId?: string;
  payerEntityId?: string;
  /** Si true, sólo trae los pagados por terceros externos (JC). */
  thirdPartyOnly?: boolean;
  status?: CadastralStatus;
}

function deriveStatus(p: {
  isPaid: boolean;
  dueDate: Date;
  paidByThirdPartyName: string | null;
}): CadastralStatus {
  if (p.isPaid) return "PAID";
  if (p.paidByThirdPartyName) return "PAID_BY_THIRD_PARTY";
  return p.dueDate.getTime() < Date.now() ? "OVERDUE" : "DUE";
}

/** Listado anual de prediales con datos de inmueble, dueña y pagador. */
export async function getCadastralPayments(filters: CadastralListFilters = {}) {
  const { tenantId } = await requireAuth();

  // Resolvemos legal entities con UNA query plana (~4 filas) en lugar de dejar
  // que Prisma cargue `property.ownerEntity` + `payerEntity` por cada predial
  // → terminaba en `IN ($1..$N)` con N = nº de prediales y datos duplicados.
  const [rows, entities] = await Promise.all([
    prisma.cadastralPayment.findMany({
      where: {
        tenantId,
        ...(filters.year !== undefined ? { year: filters.year } : {}),
        ...(filters.ownerEntityId
          ? { property: { ownerEntityId: filters.ownerEntityId } }
          : {}),
        ...(filters.payerEntityId
          ? { payerEntityId: filters.payerEntityId }
          : {}),
        ...(filters.thirdPartyOnly
          ? { paidByThirdPartyName: { not: null } }
          : {}),
      },
      orderBy: [{ year: "desc" }, { property: { name: "asc" } }],
      take: 5000,
      include: {
        property: {
          select: {
            id: true,
            name: true,
            cadastralKey: true,
            ownerEntityId: true,
          },
        },
        documents: {
          where: { type: "CADASTRAL_RECEIPT" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            filename: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.legalEntity.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    }),
  ]);
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const enriched = rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    propertyName: r.property.name,
    cadastralKey: r.property.cadastralKey,
    ownerEntity: entityMap.get(r.property.ownerEntityId)!,
    payerEntity: r.payerEntityId ? (entityMap.get(r.payerEntityId) ?? null) : null,
    paidByThirdPartyName: r.paidByThirdPartyName,
    year: r.year,
    totalAmount: r.totalAmount?.toNumber() ?? null,
    paidAmount: r.paidAmount?.toNumber() ?? null,
    paymentDate: r.paymentDate,
    dueDate: r.dueDate,
    isPaid: r.isPaid,
    notes: r.notes,
    documents: r.documents,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    status: deriveStatus(r),
  }));

  if (filters.status) {
    return enriched.filter((p) => p.status === filters.status);
  }
  return enriched;
}

export type CadastralListItem = Awaited<
  ReturnType<typeof getCadastralPayments>
>[number];

/** Años con al menos un predial registrado, descendente. */
export async function getCadastralYears(): Promise<number[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.cadastralPayment.findMany({
    where: { tenantId },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

/** Inmuebles disponibles para el form de nuevo predial. */
export async function getPropertiesForCadastralForm() {
  const { tenantId } = await requireAuth();
  return prisma.property.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cadastralKey: true,
      ownerEntity: { select: { id: true, code: true } },
    },
  });
}

export type CadastralPropertyOption = Awaited<
  ReturnType<typeof getPropertiesForCadastralForm>
>[number];
