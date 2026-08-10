"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import {
  deleteFile,
  extractKeyFromUrl,
  r2KeyForMaintenanceDocument,
  uploadFile,
} from "@/server/storage/r2";
import {
  deleteMaintenanceDocumentSchema,
  extensionForMaintenanceDocumentMime,
  uploadMaintenanceDocumentSchema,
} from "@/shared/validators/document";
import type { Prisma } from "@/generated/prisma/client";

async function logDocumentAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Document",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

export async function actionUploadMaintenanceDocument(
  formData: FormData,
): Promise<{ id: string; url: string; filename: string; mimeType: string | null }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const maintenanceIdRaw = formData.get("maintenanceId");
  const fileRaw = formData.get("file");
  const { maintenanceId, file } = uploadMaintenanceDocumentSchema.parse({
    maintenanceId: maintenanceIdRaw,
    file: fileRaw,
  });

  // Tenant guardrail: el mantenimiento debe existir en este tenant.
  await prisma.maintenance.findFirstOrThrow({
    where: { id: maintenanceId, tenantId },
    select: { id: true },
  });

  const ext = extensionForMaintenanceDocumentMime(file.type);
  const key = r2KeyForMaintenanceDocument(tenantId, maintenanceId, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, backend } = await uploadFile(key, buffer, file.type);

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "MAINTENANCE_PHOTO",
      filename: file.name,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: dbUser.id,
      maintenanceId,
    },
    select: { id: true, url: true, filename: true, mimeType: true },
  });

  await logDocumentAudit(tenantId, dbUser.id, "CREATE", doc.id, {
    maintenanceId,
    backend,
    filename: file.name,
    sizeBytes: file.size,
  });

  revalidatePath("/mantenimientos");

  return doc;
}

export async function actionDeleteMaintenanceDocument(input: {
  documentId: string;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const { documentId } = deleteMaintenanceDocumentSchema.parse(input);

  // El filtro `type` evita borrar otros documentos por error.
  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, tenantId, type: "MAINTENANCE_PHOTO" },
    select: { id: true, url: true, maintenanceId: true },
  });

  const result = await prisma.document.deleteMany({
    where: { id: documentId, tenantId },
  });
  if (result.count === 0) {
    throw new Error("Documento no encontrado o fuera de tu tenant.");
  }

  // Best-effort: si R2 falla, dejamos huérfano y seguimos.
  try {
    await deleteFile(extractKeyFromUrl(doc.url));
  } catch (err) {
    console.error(
      "[maintenance-documents] R2 delete failed, file may be orphaned",
      { url: doc.url, err },
    );
  }

  await logDocumentAudit(tenantId, dbUser.id, "DELETE", documentId, {
    maintenanceId: doc.maintenanceId,
  });

  revalidatePath("/mantenimientos");
}
