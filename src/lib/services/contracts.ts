"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  generateRentsForContract,
  reconcileRentsForContract,
  type ReconcileRentsResult,
} from "@/lib/services/rent-generation";
import {
  createContractSchema,
  renewContractSchema,
  terminateContractSchema,
  updateContractSchema,
  type CreateContractInput,
  type RenewContractInput,
  type TerminateContractInput,
  type UpdateContractInput,
} from "@/lib/validators/contract";
import type { ContractModel } from "@/generated/prisma/models";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Contract",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

export async function actionCreateContract(
  input: CreateContractInput,
): Promise<ContractModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.create");

  const data = createContractSchema.parse(input);

  // 1. Validar que la unit pertenece al tenant y NO tiene contrato ACTIVE.
  const unit = await prisma.unit.findFirst({
    where: { id: data.unitId, tenantId },
    select: {
      id: true,
      status: true,
      code: true,
      property: { select: { status: true, name: true } },
    },
  });
  if (!unit) {
    throw new Error("Unidad no encontrada o fuera de tu tenant.");
  }
  if (unit.status === "RENTADA") {
    throw new Error(
      `La unidad ${unit.code} ya está rentada. Termina el contrato vigente antes de crear uno nuevo.`,
    );
  }
  if (unit.property.status === "BLOQUEADO") {
    throw new Error(
      `El inmueble "${unit.property.name}" está bloqueado y no puede recibir contratos.`,
    );
  }

  // 2. Validar lessee del tenant.
  const lessee = await prisma.lessee.findFirst({
    where: { id: data.lesseeId, tenantId },
    select: { id: true },
  });
  if (!lessee) {
    throw new Error("Inquilino no encontrado o fuera de tu tenant.");
  }

  // 3. Crear contrato + actualizar unit en una transacción.
  const created = await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        tenantId,
        unitId: data.unitId,
        lesseeId: data.lesseeId,
        type: data.type,
        status: "DRAFT",
        startDate: data.startDate,
        endDate: data.endDate,
        monthlyAmount: decimal(data.monthlyAmount),
        guaranteeAmount: decimal(data.guaranteeAmount),
        paymentDay: data.paymentDay,
        lateFeePercentage:
          data.lateFeePercentage !== undefined ? decimal(data.lateFeePercentage) : null,
        autoRenew: data.autoRenew,
        paidInAdvance: data.paidInAdvance,
        advancePaidUntil: data.advancePaidUntil,
        signedDate: data.signedDate,
        notes: data.notes,
      },
    });

    await tx.unit.updateMany({
      where: { id: data.unitId, tenantId },
      data: { status: "RENTADA" },
    });

    return contract;
  });

  await logAudit(tenantId, dbUser.id, "CREATE", created.id, {
    after: {
      unitId: created.unitId,
      lesseeId: created.lesseeId,
      monthlyAmount: created.monthlyAmount.toString(),
      startDate: created.startDate.toISOString(),
      endDate: created.endDate.toISOString(),
    },
  });

  revalidatePath("/contracts");
  revalidatePath(`/properties/${unit.id}`);
  return created;
}

export interface UpdateContractResult {
  /** Resumen de la re-sincronización de rentas, si el contrato estaba ACTIVE y
   *  se tocó algún término que afecta los cargos. `null` si no aplicó. */
  reconcile: ReconcileRentsResult | null;
}

// No devolvemos el contrato crudo de Prisma: sus campos Decimal no son
// serializables hacia un Client Component (Next.js lo rechaza). El único
// consumidor solo necesita el resumen de reconciliación.
export async function actionUpdateContract(
  id: string,
  input: UpdateContractInput,
): Promise<UpdateContractResult> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.update");

  const data = updateContractSchema.parse(input);

  const update: Prisma.ContractUpdateManyMutationInput = {};
  if (data.status !== undefined) update.status = data.status;
  if (data.type !== undefined) update.type = data.type;
  if (data.startDate !== undefined) update.startDate = data.startDate;
  if (data.endDate !== undefined) update.endDate = data.endDate;
  if (data.monthlyAmount !== undefined) update.monthlyAmount = decimal(data.monthlyAmount);
  if (data.guaranteeAmount !== undefined)
    update.guaranteeAmount = decimal(data.guaranteeAmount);
  if (data.paymentDay !== undefined) update.paymentDay = data.paymentDay;
  if (data.lateFeePercentage !== undefined)
    update.lateFeePercentage = decimal(data.lateFeePercentage);
  if (data.autoRenew !== undefined) update.autoRenew = data.autoRenew;
  if (data.paidInAdvance !== undefined) update.paidInAdvance = data.paidInAdvance;
  if (data.advancePaidUntil !== undefined) update.advancePaidUntil = data.advancePaidUntil;
  if (data.signedDate !== undefined) update.signedDate = data.signedDate;
  if (data.notes !== undefined) update.notes = data.notes;

  const result = await prisma.contract.updateMany({
    where: { id, tenantId },
    data: update,
  });
  if (result.count === 0) {
    throw new Error("Contrato no encontrado o fuera de tu tenant.");
  }

  const updated = await prisma.contract.findFirstOrThrow({
    where: { id, tenantId },
    select: { status: true },
  });

  // Si el contrato ya está ACTIVE y se editó algo que afecta los cargos
  // mensuales (fechas, monto, día de cobro, pago adelantado), re-sincronizamos
  // las rentas para que el calendario de cobranza refleje los nuevos términos.
  const rentAffecting =
    data.startDate !== undefined ||
    data.endDate !== undefined ||
    data.monthlyAmount !== undefined ||
    data.paymentDay !== undefined ||
    data.paidInAdvance !== undefined ||
    data.advancePaidUntil !== undefined;

  let reconcile: ReconcileRentsResult | null = null;
  if (updated.status === "ACTIVE" && rentAffecting) {
    reconcile = await reconcileRentsForContract(tenantId, id);
  }

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    after: data as unknown as Prisma.InputJsonValue,
    ...(reconcile ? { reconcile: reconcile as unknown as Prisma.InputJsonValue } : {}),
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  revalidatePath("/collections");
  return { reconcile };
}

export async function actionActivateContract(id: string): Promise<{
  contract: ContractModel;
  rentsCreated: number;
}> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.update");

  const current = await prisma.contract.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  });
  if (!current) throw new Error("Contrato no encontrado o fuera de tu tenant.");
  if (current.status !== "DRAFT") {
    throw new Error(
      `Solo se puede activar un contrato en borrador. Estado actual: ${current.status}.`,
    );
  }

  await prisma.contract.updateMany({
    where: { id, tenantId },
    data: { status: "ACTIVE" },
  });

  const result = await generateRentsForContract(tenantId, id);

  const updated = await prisma.contract.findFirstOrThrow({
    where: { id, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    transition: { from: "DRAFT", to: "ACTIVE" },
    rentsCreated: result.created,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { contract: updated, rentsCreated: result.created };
}

export async function actionTerminateContract(
  id: string,
  input: TerminateContractInput,
): Promise<ContractModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.update");

  const data = terminateContractSchema.parse(input);

  const contract = await prisma.contract.findFirst({
    where: { id, tenantId },
    select: { id: true, unitId: true, status: true, notes: true },
  });
  if (!contract) throw new Error("Contrato no encontrado o fuera de tu tenant.");
  if (contract.status === "TERMINATED" || contract.status === "CANCELLED") {
    throw new Error("Este contrato ya está terminado o cancelado.");
  }

  const noteSuffix = `\n[Terminado ${data.terminationDate.toISOString().slice(0, 10)}] ${data.reason}`;
  const updatedNotes = (contract.notes ?? "") + noteSuffix;

  // Cambiar estado del contrato y liberar la unidad. NO se borran rents.
  await prisma.$transaction(async (tx) => {
    await tx.contract.updateMany({
      where: { id, tenantId },
      data: {
        status: "TERMINATED",
        endDate: data.terminationDate,
        notes: updatedNotes,
      },
    });
    await tx.unit.updateMany({
      where: { id: contract.unitId, tenantId },
      data: { status: "DISPONIBLE" },
    });
  });

  const updated = await prisma.contract.findFirstOrThrow({
    where: { id, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    transition: { from: contract.status, to: "TERMINATED" },
    terminationDate: data.terminationDate.toISOString(),
    reason: data.reason,
    unitReleased: contract.unitId,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return updated;
}

export async function actionRenewContract(
  id: string,
  input: RenewContractInput,
): Promise<ContractModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.create");

  const data = renewContractSchema.parse(input);

  const parent = await prisma.contract.findFirst({
    where: { id, tenantId },
  });
  if (!parent) throw new Error("Contrato no encontrado o fuera de tu tenant.");
  if (data.newEndDate.getTime() <= parent.endDate.getTime()) {
    throw new Error(
      "La nueva fecha de fin debe ser posterior al fin del contrato actual.",
    );
  }

  // El hijo arranca el día siguiente al fin del padre.
  const childStart = new Date(parent.endDate.getTime() + 24 * 60 * 60 * 1000);

  const child = await prisma.contract.create({
    data: {
      tenantId,
      unitId: parent.unitId,
      lesseeId: parent.lesseeId,
      type: parent.type,
      status: "DRAFT",
      startDate: childStart,
      endDate: data.newEndDate,
      monthlyAmount: decimal(data.newAmount),
      guaranteeAmount: parent.guaranteeAmount,
      paymentDay: parent.paymentDay,
      lateFeePercentage: parent.lateFeePercentage,
      autoRenew: parent.autoRenew,
      notes: `Renovación de ${id}.`,
    },
  });

  // Marcamos el padre como pendiente de renovación para alertas visuales.
  await prisma.contract.updateMany({
    where: { id, tenantId },
    data: { status: "PENDING_RENEWAL" },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", child.id, {
    renewedFrom: id,
    newEndDate: data.newEndDate.toISOString(),
    newAmount: data.newAmount,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return child;
}
