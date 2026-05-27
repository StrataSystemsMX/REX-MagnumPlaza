import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import type { GuaranteeStatus } from "@/generated/prisma/enums";

export interface GuaranteeFilters {
  status?: GuaranteeStatus;
  propertyId?: string;
}

export async function getGuarantees(filters: GuaranteeFilters = {}) {
  const { tenantId } = await requireAuth();

  const rows = await prisma.guarantee.findMany({
    where: {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.propertyId
        ? { contract: { unit: { propertyId: filters.propertyId } } }
        : {}),
    },
    orderBy: { receivedDate: "desc" },
    include: {
      contract: {
        select: {
          id: true,
          monthlyAmount: true,
          startDate: true,
          endDate: true,
          status: true,
          lessee: { select: { id: true, legalName: true, contactName: true } },
          unit: {
            select: {
              id: true,
              code: true,
              name: true,
              property: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  ownerEntity: {
                    select: { id: true, code: true, legalName: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return rows.map((g) => ({
    id: g.id,
    contractId: g.contractId,
    amount: g.amount.toNumber(),
    status: g.status,
    receivedDate: g.receivedDate,
    returnedDate: g.returnedDate,
    returnedAmount: g.returnedAmount?.toNumber() ?? null,
    deductions: g.deductions as Array<{ concept: string; amount: number; evidenceDocId?: string }> | null,
    notes: g.notes,
    createdAt: g.createdAt,
    contract: {
      id: g.contract.id,
      monthlyAmount: g.contract.monthlyAmount.toNumber(),
      startDate: g.contract.startDate,
      endDate: g.contract.endDate,
      status: g.contract.status,
      lessee: g.contract.lessee,
      unit: g.contract.unit,
    },
  }));
}

export type GuaranteeRow = Awaited<ReturnType<typeof getGuarantees>>[number];

/** Contratos activos sin fianza registrada — para el formulario de alta. */
export async function getContractsWithoutGuarantee() {
  const { tenantId } = await requireAuth();

  const contractsWithGuarantee = await prisma.guarantee.findMany({
    where: { tenantId },
    select: { contractId: true },
    distinct: ["contractId"],
  });
  const excludeIds = contractsWithGuarantee.map((g) => g.contractId);

  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: { in: ["ACTIVE", "DRAFT"] },
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      startDate: true,
      guaranteeAmount: true,
      lessee: { select: { id: true, legalName: true } },
      unit: {
        select: {
          code: true,
          name: true,
          property: { select: { name: true, type: true } },
        },
      },
    },
  });
  return contracts.map((c) => ({ ...c, guaranteeAmount: c.guaranteeAmount.toNumber() }));
}

export type ContractForGuarantee = Awaited<
  ReturnType<typeof getContractsWithoutGuarantee>
>[number];
