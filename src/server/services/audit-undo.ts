import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/prisma/client";
import { recalcRentInTx, type TxClient } from "@/server/services/rent-recalc";
import { coerceFields } from "@/shared/audit/field-types";

// =============================================================================
// Handlers de "Deshacer" por entidad
// -----------------------------------------------------------------------------
// Cada sujeto define cómo:
//   - revertir una edición (restaurar `before`),
//   - deshacer una creación borrando TODO su subárbol (cascada manual, porque
//     las FKs hijo→padre son Restrict),
//   - restaurar un borrado lógico,
//   - contar dependientes (para el aviso destacado).
//
// Todo lo destructivo corre dentro de `prisma.$transaction`: si algún borrado
// choca con una FK no contemplada, la transacción hace rollback completo y NO
// queda estado parcial. Por eso basta con cubrir el grafo conocido.
// =============================================================================

const ACTIVE_CONTRACT_STATES = ["DRAFT", "ACTIVE", "PENDING_RENEWAL"] as const;

export interface DependentCounts {
  unidades?: number;
  contratos?: number;
  rentas?: number;
  pagos?: number;
  fianzas?: number;
  documentos?: number;
  prediales?: number;
  mantenimientos?: number;
}

/** Previsualización del efecto de deshacer un cambio (para la UI). */
export interface UndoImpact {
  reversible: boolean;
  reason?: string;
  /** true si deshacer borrará registros importantes (cascada con dependientes). */
  danger: boolean;
  dependents?: DependentCounts;
}

function omitZero(counts: DependentCounts): DependentCounts {
  const out: DependentCounts = {};
  for (const [k, v] of Object.entries(counts)) {
    if (typeof v === "number" && v > 0) out[k as keyof DependentCounts] = v;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Cascadas de borrado (de abajo hacia arriba, dentro de la transacción)
// ----------------------------------------------------------------------------

async function cascadeDeleteContract(
  tx: TxClient,
  tenantId: string,
  contractId: string,
): Promise<void> {
  const contract = await tx.contract.findFirst({
    where: { id: contractId, tenantId },
    select: { unitId: true },
  });

  const rents = await tx.rent.findMany({
    where: { tenantId, contractId },
    select: { id: true },
  });
  const rentIds = rents.map((r) => r.id);
  if (rentIds.length > 0) {
    await tx.payment.deleteMany({ where: { tenantId, rentId: { in: rentIds } } });
  }
  await tx.rent.deleteMany({ where: { tenantId, contractId } });
  await tx.guarantee.deleteMany({ where: { tenantId, contractId } });
  await tx.document.deleteMany({ where: { tenantId, contractId } });
  await tx.contract.deleteMany({ where: { id: contractId, tenantId } });

  // Liberar la unidad si ya no le queda ningún contrato vigente.
  if (contract?.unitId) {
    const stillActive = await tx.contract.count({
      where: {
        tenantId,
        unitId: contract.unitId,
        status: { in: [...ACTIVE_CONTRACT_STATES] },
      },
    });
    if (stillActive === 0) {
      await tx.unit.updateMany({
        where: { id: contract.unitId, tenantId },
        data: { status: "DISPONIBLE" },
      });
    }
  }
}

async function cascadeDeleteLessee(
  tx: TxClient,
  tenantId: string,
  lesseeId: string,
): Promise<void> {
  const contracts = await tx.contract.findMany({
    where: { tenantId, lesseeId },
    select: { id: true },
  });
  for (const c of contracts) await cascadeDeleteContract(tx, tenantId, c.id);
  await tx.lessee.deleteMany({ where: { id: lesseeId, tenantId } });
}

async function cascadeDeleteUnit(
  tx: TxClient,
  tenantId: string,
  unitId: string,
): Promise<void> {
  const contracts = await tx.contract.findMany({
    where: { tenantId, unitId },
    select: { id: true },
  });
  for (const c of contracts) await cascadeDeleteContract(tx, tenantId, c.id);
  await tx.document.deleteMany({ where: { tenantId, unitId } });
  await tx.maintenance.updateMany({ where: { tenantId, unitId }, data: { unitId: null } });
  // Desagrupar sub-locales antes de borrar el padre.
  await tx.unit.updateMany({
    where: { tenantId, parentUnitId: unitId },
    data: { parentUnitId: null },
  });
  await tx.unit.deleteMany({ where: { id: unitId, tenantId } });
}

async function cascadeDeleteProperty(
  tx: TxClient,
  tenantId: string,
  propertyId: string,
): Promise<void> {
  const units = await tx.unit.findMany({
    where: { tenantId, propertyId },
    select: { id: true },
  });
  for (const u of units) await cascadeDeleteUnit(tx, tenantId, u.id);
  await tx.cadastralPayment.deleteMany({ where: { tenantId, propertyId } });
  await tx.maintenance.deleteMany({ where: { tenantId, propertyId } });
  await tx.document.deleteMany({ where: { tenantId, propertyId } });
  await tx.property.deleteMany({ where: { id: propertyId, tenantId } });
}

async function cascadeDeletePayment(
  tx: TxClient,
  tenantId: string,
  paymentId: string,
  now: Date,
): Promise<void> {
  const payment = await tx.payment.findFirst({
    where: { id: paymentId, tenantId },
    select: { rentId: true },
  });
  await tx.payment.deleteMany({ where: { id: paymentId, tenantId } });
  if (payment?.rentId) await recalcRentInTx(tx, tenantId, payment.rentId, now);
}

// ----------------------------------------------------------------------------
// Reversión de ediciones (restaurar `before`)
// ----------------------------------------------------------------------------

async function revertLessee(tx: TxClient, tenantId: string, id: string, before: Record<string, unknown>) {
  await tx.lessee.updateMany({
    where: { id, tenantId },
    data: coerceFields(before) as unknown as Prisma.LesseeUpdateManyMutationInput,
  });
  return {};
}

async function revertProperty(tx: TxClient, tenantId: string, id: string, before: Record<string, unknown>) {
  await tx.property.updateMany({
    where: { id, tenantId },
    data: coerceFields(before) as unknown as Prisma.PropertyUpdateManyMutationInput,
  });
  return {};
}

async function revertUnit(tx: TxClient, tenantId: string, id: string, before: Record<string, unknown>) {
  await tx.unit.updateMany({
    where: { id, tenantId },
    data: coerceFields(before) as unknown as Prisma.UnitUpdateManyMutationInput,
  });
  return {};
}

async function revertContract(tx: TxClient, tenantId: string, id: string, before: Record<string, unknown>) {
  await tx.contract.updateMany({
    where: { id, tenantId },
    data: coerceFields(before) as unknown as Prisma.ContractUpdateManyMutationInput,
  });
  // La reconciliación de rentas se hace fuera de la tx (usa prisma global),
  // igual que `actionUpdateContract`. Señalamos qué contrato reconciliar.
  return { reconcileContractId: id };
}

async function revertPayment(tx: TxClient, tenantId: string, id: string, before: Record<string, unknown>) {
  await tx.payment.updateMany({
    where: { id, tenantId },
    data: coerceFields(before) as unknown as Prisma.PaymentUpdateManyMutationInput,
  });
  // Restaurar montos/fecha del pago cambia el saldo de su renta → recalcular.
  const payment = await tx.payment.findFirst({ where: { id, tenantId }, select: { rentId: true } });
  if (payment?.rentId) await recalcRentInTx(tx, tenantId, payment.rentId, new Date());
  return {};
}

// ----------------------------------------------------------------------------
// Restauración de borrados lógicos (idempotente vía `isActive: false`)
// ----------------------------------------------------------------------------

async function restoreLessee(tx: TxClient, tenantId: string, id: string): Promise<boolean> {
  const r = await tx.lessee.updateMany({ where: { id, tenantId, isActive: false }, data: { isActive: true } });
  return r.count > 0;
}
async function restoreProperty(tx: TxClient, tenantId: string, id: string): Promise<boolean> {
  const r = await tx.property.updateMany({ where: { id, tenantId, isActive: false }, data: { isActive: true } });
  return r.count > 0;
}
async function restoreUnit(tx: TxClient, tenantId: string, id: string): Promise<boolean> {
  const r = await tx.unit.updateMany({ where: { id, tenantId, isActive: false }, data: { isActive: true } });
  return r.count > 0;
}

// ----------------------------------------------------------------------------
// Conteo de dependientes (para el aviso destacado)
// ----------------------------------------------------------------------------

async function countContractDeps(tenantId: string, contractId: string): Promise<DependentCounts> {
  const [rentas, fianzas, documentos, pagos] = await Promise.all([
    prisma.rent.count({ where: { tenantId, contractId } }),
    prisma.guarantee.count({ where: { tenantId, contractId } }),
    prisma.document.count({ where: { tenantId, contractId } }),
    prisma.payment.count({ where: { tenantId, rent: { contractId } } }),
  ]);
  return omitZero({ rentas, pagos, fianzas, documentos });
}

async function countLesseeDeps(tenantId: string, lesseeId: string): Promise<DependentCounts> {
  const contracts = await prisma.contract.findMany({
    where: { tenantId, lesseeId },
    select: { id: true },
  });
  const contractIds = contracts.map((c) => c.id);
  if (contractIds.length === 0) return {};
  const [rentas, pagos, fianzas] = await Promise.all([
    prisma.rent.count({ where: { tenantId, contractId: { in: contractIds } } }),
    prisma.payment.count({ where: { tenantId, rent: { contractId: { in: contractIds } } } }),
    prisma.guarantee.count({ where: { tenantId, contractId: { in: contractIds } } }),
  ]);
  return omitZero({ contratos: contractIds.length, rentas, pagos, fianzas });
}

async function countUnitDeps(tenantId: string, unitId: string): Promise<DependentCounts> {
  const [contratos, documentos] = await Promise.all([
    prisma.contract.count({ where: { tenantId, unitId } }),
    prisma.document.count({ where: { tenantId, unitId } }),
  ]);
  return omitZero({ contratos, documentos });
}

async function countPropertyDeps(tenantId: string, propertyId: string): Promise<DependentCounts> {
  const [unidades, contratos, prediales, mantenimientos] = await Promise.all([
    prisma.unit.count({ where: { tenantId, propertyId } }),
    prisma.contract.count({ where: { tenantId, unit: { propertyId } } }),
    prisma.cadastralPayment.count({ where: { tenantId, propertyId } }),
    prisma.maintenance.count({ where: { tenantId, propertyId } }),
  ]);
  return omitZero({ unidades, contratos, prediales, mantenimientos });
}

// ----------------------------------------------------------------------------
// Registro
// ----------------------------------------------------------------------------

export interface UndoHandler {
  revert?: (
    tx: TxClient,
    tenantId: string,
    id: string,
    before: Record<string, unknown>,
  ) => Promise<{ reconcileContractId?: string }>;
  cascadeDelete?: (tx: TxClient, tenantId: string, id: string, now: Date) => Promise<void>;
  restore?: (tx: TxClient, tenantId: string, id: string) => Promise<boolean>;
  countDependents?: (tenantId: string, id: string) => Promise<DependentCounts>;
}

export const UNDO_HANDLERS: Record<string, UndoHandler> = {
  Lessee: {
    revert: revertLessee,
    cascadeDelete: cascadeDeleteLessee,
    restore: restoreLessee,
    countDependents: countLesseeDeps,
  },
  Property: {
    revert: revertProperty,
    cascadeDelete: cascadeDeleteProperty,
    restore: restoreProperty,
    countDependents: countPropertyDeps,
  },
  Unit: {
    revert: revertUnit,
    cascadeDelete: cascadeDeleteUnit,
    restore: restoreUnit,
    countDependents: countUnitDeps,
  },
  Contract: {
    revert: revertContract,
    cascadeDelete: cascadeDeleteContract,
    countDependents: countContractDeps,
  },
  Payment: {
    revert: revertPayment,
    cascadeDelete: cascadeDeletePayment,
  },
};

/** Cuenta los dependientes de un sujeto, o `null` si la entidad no aplica. */
export async function getDependentCounts(
  entityType: string,
  tenantId: string,
  id: string,
): Promise<DependentCounts | null> {
  const handler = UNDO_HANDLERS[entityType];
  if (!handler?.countDependents) return null;
  return handler.countDependents(tenantId, id);
}

export function hasAnyDependents(counts: DependentCounts | null): boolean {
  return !!counts && Object.keys(counts).length > 0;
}
