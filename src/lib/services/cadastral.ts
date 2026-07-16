"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit as logAuditCore } from "@/lib/services/audit";
import {
  deleteFile,
  extractKeyFromUrl,
  uploadFile,
} from "@/lib/storage/r2";
import {
  createCadastralPaymentSchema,
  deleteCadastralPaymentSchema,
  deleteCadastralReceiptSchema,
  extensionForCadastralReceiptMime,
  registerCadastralPaymentSchema,
  unmarkCadastralPaymentSchema,
  updateCadastralPaymentSchema,
  uploadCadastralReceiptSchema,
  type CreateCadastralPaymentInput,
  type DeleteCadastralPaymentInput,
  type DeleteCadastralReceiptInput,
  type RegisterCadastralPaymentInput,
  type UnmarkCadastralPaymentInput,
  type UpdateCadastralPaymentInput,
} from "@/lib/validators/cadastral";

const CADASTRAL_PERM = {
  create: "expense.create",
  update: "expense.update",
  delete: "expense.delete",
} as const;

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await logAuditCore({ tenantId, userId, action, entityType: "CadastralPayment", entityId, changes });
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

function r2KeyForCadastralReceipt(
  tenantId: string,
  cadastralPaymentId: string,
  ext: string,
): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `tenants/${tenantId}/cadastral-receipts/${cadastralPaymentId}/${id}.${ext}`;
}

async function ensurePropertyInTenant(
  tenantId: string,
  propertyId: string,
): Promise<void> {
  await prisma.property.findFirstOrThrow({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
}

async function ensurePayerEntityInTenant(
  tenantId: string,
  payerEntityId: string,
): Promise<void> {
  await prisma.legalEntity.findFirstOrThrow({
    where: { id: payerEntityId, tenantId, isActive: true },
    select: { id: true },
  });
}

export async function actionCreateCadastralPayment(
  input: CreateCadastralPaymentInput,
): Promise<{ id: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.create);

  const data = createCadastralPaymentSchema.parse(input);

  await ensurePropertyInTenant(tenantId, data.propertyId);
  if (data.payerEntityId) {
    await ensurePayerEntityInTenant(tenantId, data.payerEntityId);
  }

  const created = await prisma.cadastralPayment.create({
    data: {
      tenantId,
      propertyId: data.propertyId,
      year: data.year,
      totalAmount: data.totalAmount !== undefined ? decimal(data.totalAmount) : null,
      dueDate: data.dueDate,
      payerEntityId: data.payerEntityId ?? null,
      paidByThirdPartyName: data.paidByThirdPartyName ?? null,
      notes: data.notes ?? null,
    },
    select: { id: true },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", created.id, {
    propertyId: data.propertyId,
    year: data.year,
    totalAmount: data.totalAmount ?? null,
  });

  revalidatePath("/prediales");
  return created;
}

export async function actionUpdateCadastralPayment(
  input: UpdateCadastralPaymentInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.update);

  const data = updateCadastralPaymentSchema.parse(input);

  await ensurePropertyInTenant(tenantId, data.propertyId);
  if (data.payerEntityId) {
    await ensurePayerEntityInTenant(tenantId, data.payerEntityId);
  }

  // Tenant guardrail antes de mutar.
  await prisma.cadastralPayment.findFirstOrThrow({
    where: { id: data.id, tenantId },
    select: { id: true },
  });

  await prisma.cadastralPayment.update({
    where: { id: data.id, tenantId },
    data: {
      propertyId: data.propertyId,
      year: data.year,
      totalAmount: data.totalAmount !== undefined ? decimal(data.totalAmount) : null,
      dueDate: data.dueDate,
      payerEntityId: data.payerEntityId ?? null,
      paidByThirdPartyName: data.paidByThirdPartyName ?? null,
      notes: data.notes ?? null,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", data.id, {
    propertyId: data.propertyId,
    year: data.year,
    totalAmount: data.totalAmount ?? null,
  });

  revalidatePath("/prediales");
}

export async function actionRegisterCadastralPayment(
  input: RegisterCadastralPaymentInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.update);

  const data = registerCadastralPaymentSchema.parse(input);

  const existing = await prisma.cadastralPayment.findFirstOrThrow({
    where: { id: data.id, tenantId },
    select: { id: true, notes: true },
  });

  const mergedNotes =
    data.notes && data.notes.trim().length > 0
      ? existing.notes
        ? `${existing.notes}\n${data.notes.trim()}`
        : data.notes.trim()
      : existing.notes;

  await prisma.cadastralPayment.update({
    where: { id: data.id, tenantId },
    data: {
      paidAmount: decimal(data.paidAmount),
      paymentDate: data.paymentDate,
      isPaid: true,
      notes: mergedNotes,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", data.id, {
    action: "REGISTER_PAYMENT",
    paidAmount: data.paidAmount,
  });

  revalidatePath("/prediales");
}

export async function actionUnmarkCadastralPayment(
  input: UnmarkCadastralPaymentInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.update);

  const { id } = unmarkCadastralPaymentSchema.parse(input);

  await prisma.cadastralPayment.findFirstOrThrow({
    where: { id, tenantId },
    select: { id: true },
  });

  await prisma.cadastralPayment.update({
    where: { id, tenantId },
    data: {
      isPaid: false,
      paidAmount: null,
      paymentDate: null,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    action: "UNMARK_PAYMENT",
  });

  revalidatePath("/prediales");
}

export async function actionDeleteCadastralPayment(
  input: DeleteCadastralPaymentInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.delete);

  const { id } = deleteCadastralPaymentSchema.parse(input);

  // Cargar boletas asociadas para limpieza best-effort en R2.
  const existing = await prisma.cadastralPayment.findFirstOrThrow({
    where: { id, tenantId },
    select: {
      id: true,
      documents: {
        where: { type: "CADASTRAL_RECEIPT" },
        select: { id: true, url: true },
      },
    },
  });

  await prisma.cadastralPayment.delete({ where: { id, tenantId } });

  for (const doc of existing.documents) {
    try {
      await deleteFile(extractKeyFromUrl(doc.url));
    } catch (err) {
      console.error("[cadastral] R2 delete failed, file may be orphaned", {
        url: doc.url,
        err,
      });
    }
  }

  await logAudit(tenantId, dbUser.id, "DELETE", id);

  revalidatePath("/prediales");
}

export async function actionUploadCadastralReceipt(
  formData: FormData,
): Promise<{ id: string; url: string; filename: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.update);

  const cadastralPaymentIdRaw = formData.get("cadastralPaymentId");
  const fileRaw = formData.get("file");
  const { cadastralPaymentId, file } = uploadCadastralReceiptSchema.parse({
    cadastralPaymentId: cadastralPaymentIdRaw,
    file: fileRaw,
  });

  await prisma.cadastralPayment.findFirstOrThrow({
    where: { id: cadastralPaymentId, tenantId },
    select: { id: true },
  });

  const ext = extensionForCadastralReceiptMime(file.type);
  const key = r2KeyForCadastralReceipt(tenantId, cadastralPaymentId, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, backend } = await uploadFile(key, buffer, file.type);

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "CADASTRAL_RECEIPT",
      filename: file.name,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: dbUser.id,
      cadastralPaymentId,
    },
    select: { id: true, url: true, filename: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: dbUser.id,
      action: "CREATE",
      entityType: "Document",
      entityId: doc.id,
      changes: {
        cadastralPaymentId,
        backend,
        filename: file.name,
        sizeBytes: file.size,
      },
    },
  });

  revalidatePath("/prediales");

  return doc;
}

export async function actionDeleteCadastralReceipt(
  input: DeleteCadastralReceiptInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, CADASTRAL_PERM.update);

  const { documentId } = deleteCadastralReceiptSchema.parse(input);

  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, tenantId, type: "CADASTRAL_RECEIPT" },
    select: { id: true, url: true, cadastralPaymentId: true },
  });

  await prisma.document.delete({ where: { id: documentId, tenantId } });

  try {
    await deleteFile(extractKeyFromUrl(doc.url));
  } catch (err) {
    console.error("[cadastral] R2 delete failed, file may be orphaned", {
      url: doc.url,
      err,
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: dbUser.id,
      action: "DELETE",
      entityType: "Document",
      entityId: documentId,
      changes: { cadastralPaymentId: doc.cadastralPaymentId },
    },
  });

  revalidatePath("/prediales");
}
