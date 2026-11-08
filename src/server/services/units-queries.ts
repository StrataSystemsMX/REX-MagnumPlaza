import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";

/**
 * Detalle completo de un local/inmueble para la vista unificada
 * /properties/[unitId]: características del espacio, de la propiedad que lo
 * contiene, su inquilino y contrato activo (si hay), y el predial de la
 * propiedad (el predial es por Property, no por Unit — una plaza con 10
 * locales tiene un solo registro de predial por año).
 */
export async function getUnitDetail(unitId: string) {
  const { tenantId } = await requireAuth();

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, tenantId },
    include: {
      property: {
        include: {
          ownerEntity: { select: { id: true, code: true, legalName: true } },
          managerEntity: { select: { id: true, code: true, legalName: true } },
        },
      },
      parentUnit: { select: { id: true, code: true, name: true } },
      childUnits: {
        select: { id: true, code: true, name: true, area: true },
        orderBy: { code: "asc" },
      },
      contracts: {
        where: { status: "ACTIVE" },
        orderBy: { startDate: "desc" },
        take: 1,
        include: { lessee: true },
      },
      documents: {
        where: { type: "UNIT_PHOTO" },
        orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        select: { id: true, url: true, filename: true },
      },
    },
  });
  if (!unit) return null;

  // Fotos de la propiedad (relevantes cuando el "local" es en realidad un
  // inmueble individual — ahí las fotos que importan son las de la propiedad).
  const propertyPhotos = await prisma.document.findMany({
    where: { tenantId, propertyId: unit.propertyId, type: "PROPERTY_PHOTO" },
    orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, url: true, filename: true },
  });

  // Predial de la propiedad — últimos 3 años, para un vistazo rápido en la
  // tab "Predial" sin duplicar toda la tabla de /prediales aquí.
  const cadastralPayments = await prisma.cadastralPayment.findMany({
    where: { tenantId, propertyId: unit.propertyId },
    orderBy: { year: "desc" },
    take: 3,
  });

  // Otros locales de la misma propiedad — para el select "Local padre" del
  // formulario de edición (agrupar locales), igual que en la vista de Plaza.
  const siblings = await prisma.unit.findMany({
    where: { tenantId, propertyId: unit.propertyId, isActive: true, id: { not: unit.id } },
    select: { id: true, code: true, name: true, parentUnitId: true },
    orderBy: { code: "asc" },
  });

  const contract = unit.contracts[0] ?? null;

  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    status: unit.status,
    area: unit.area != null ? Number(unit.area) : null,
    estimatedRent: unit.estimatedRent != null ? unit.estimatedRent.toNumber() : null,
    depositMonths: unit.depositMonths,
    minContractMonths: unit.minContractMonths,
    maintenanceFee: unit.maintenanceFee != null ? unit.maintenanceFee.toNumber() : null,
    availableFrom: unit.availableFrom,
    includedServices: unit.includedServices,
    notes: unit.notes,
    isActive: unit.isActive,
    parentUnit: unit.parentUnit,
    childUnits: unit.childUnits.map((c) => ({
      ...c,
      area: c.area != null ? Number(c.area) : null,
    })),
    siblings,
    photos: unit.documents,
    property: {
      id: unit.property.id,
      name: unit.property.name,
      type: unit.property.type,
      status: unit.property.status,
      address: unit.property.address,
      cadastralKey: unit.property.cadastralKey,
      totalArea: unit.property.totalArea != null ? Number(unit.property.totalArea) : null,
      notes: unit.property.notes,
      latitude: unit.property.latitude,
      longitude: unit.property.longitude,
      insuranceProvider: unit.property.insuranceProvider,
      insurancePolicyNumber: unit.property.insurancePolicyNumber,
      insuranceExpiresAt: unit.property.insuranceExpiresAt,
      ownerEntity: unit.property.ownerEntity,
      managerEntity: unit.property.managerEntity,
      photos: propertyPhotos,
    },
    contract: contract
      ? {
          id: contract.id,
          status: contract.status,
          type: contract.type,
          monthlyAmount: contract.monthlyAmount.toNumber(),
          guaranteeAmount: contract.guaranteeAmount.toNumber(),
          startDate: contract.startDate,
          endDate: contract.endDate,
          paymentDay: contract.paymentDay,
          lateFeePercentage:
            contract.lateFeePercentage != null ? contract.lateFeePercentage.toNumber() : null,
          lessee: {
            id: contract.lessee.id,
            legalName: contract.lessee.legalName,
            contactName: contract.lessee.contactName,
            rfc: contract.lessee.rfc,
            email: contract.lessee.email,
            phone: contract.lessee.phone,
            whatsapp: contract.lessee.whatsapp,
            preferredChannel: contract.lessee.preferredChannel,
          },
        }
      : null,
    cadastralPayments: cadastralPayments.map((cp) => ({
      id: cp.id,
      year: cp.year,
      totalAmount: cp.totalAmount != null ? cp.totalAmount.toNumber() : null,
      paidAmount: cp.paidAmount != null ? cp.paidAmount.toNumber() : null,
      isPaid: cp.isPaid,
      dueDate: cp.dueDate,
      paymentDate: cp.paymentDate,
    })),
  };
}

export type UnitDetail = NonNullable<Awaited<ReturnType<typeof getUnitDetail>>>;
