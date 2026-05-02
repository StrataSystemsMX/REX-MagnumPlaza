import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

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

  const rows = await prisma.cadastralPayment.findMany({
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
    include: {
      property: {
        select: {
          id: true,
          name: true,
          cadastralKey: true,
          ownerEntity: { select: { id: true, code: true } },
        },
      },
      payerEntity: { select: { id: true, code: true } },
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
  });

  const enriched = rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    propertyName: r.property.name,
    cadastralKey: r.property.cadastralKey,
    ownerEntity: r.property.ownerEntity,
    payerEntity: r.payerEntity,
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

/** Detalle de un predial específico — incluye boletas adjuntas. */
export async function getCadastralPaymentById(id: string) {
  const { tenantId } = await requireAuth();

  const r = await prisma.cadastralPayment.findFirst({
    where: { id, tenantId },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          cadastralKey: true,
          ownerEntity: { select: { id: true, code: true, legalName: true } },
        },
      },
      payerEntity: { select: { id: true, code: true, legalName: true } },
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
  });
  if (!r) return null;

  return {
    id: r.id,
    propertyId: r.propertyId,
    property: r.property,
    payerEntity: r.payerEntity,
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
  };
}

export type CadastralDetail = NonNullable<
  Awaited<ReturnType<typeof getCadastralPaymentById>>
>;

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
