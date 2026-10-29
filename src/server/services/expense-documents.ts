"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { r2KeyForExpenseDocument, uploadFile } from "@/server/storage/r2";
import {
  extensionForMaintenanceDocumentMime,
  uploadExpenseDocumentSchema,
} from "@/shared/validators/document";

/**
 * Sube el comprobante (factura, recibo o ticket) de un egreso. Pensado para la
 * captura móvil: foto tomada con la cámara (`capture="environment"`) o PDF.
 */
export async function actionUploadExpenseDocument(
  formData: FormData,
): Promise<{ id: string; url: string; filename: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  const { expenseId, file } = uploadExpenseDocumentSchema.parse({
    expenseId: formData.get("expenseId"),
    file: formData.get("file"),
  });

  // Tenant guardrail: el egreso debe existir en este tenant.
  await prisma.expense.findFirstOrThrow({
    where: { id: expenseId, tenantId },
    select: { id: true },
  });

  const ext = extensionForMaintenanceDocumentMime(file.type);
  const key = r2KeyForExpenseDocument(tenantId, expenseId, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, backend } = await uploadFile(key, buffer, file.type);

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "INVOICE",
      filename: file.name,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: dbUser.id,
      expenseId,
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
      changes: { expenseId, backend, filename: file.name, sizeBytes: file.size },
    },
  });

  revalidatePath("/egresos");
  return doc;
}
