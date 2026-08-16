"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import {
  deleteFile,
  extractKeyFromUrl,
  r2KeyForContractDocument,
  uploadFile,
} from "@/server/storage/r2";
import {
  deleteContractDocumentSchema,
  extensionForContractDocumentMime,
  uploadContractDocumentSchema,
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

export async function actionUploadContractDocument(
  formData: FormData,
): Promise<{ id: string; url: string; filename: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.update");

  const contractIdRaw = formData.get("contractId");
  const fileRaw = formData.get("file");
  const { contractId, file } = uploadContractDocumentSchema.parse({
    contractId: contractIdRaw,
    file: fileRaw,
  });

  // Tenant guardrail: el contrato debe existir en este tenant.
  await prisma.contract.findFirstOrThrow({
    where: { id: contractId, tenantId },
    select: { id: true },
  });

  const ext = extensionForContractDocumentMime(file.type);
  const key = r2KeyForContractDocument(tenantId, contractId, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, backend } = await uploadFile(key, buffer, file.type);

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "CONTRACT_PDF",
      filename: file.name,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: dbUser.id,
      contractId,
    },
    select: { id: true, url: true, filename: true },
  });

  await logDocumentAudit(tenantId, dbUser.id, "CREATE", doc.id, {
    contractId,
    backend,
    filename: file.name,
    sizeBytes: file.size,
  });

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");

  return doc;
}

export async function actionDeleteContractDocument(input: {
  documentId: string;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.update");

  const { documentId } = deleteContractDocumentSchema.parse(input);

  // El filtro `type` evita borrar fotos u otros documentos por error.
  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, tenantId, type: "CONTRACT_PDF" },
    select: { id: true, url: true, contractId: true },
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
      "[contract-documents] R2 delete failed, file may be orphaned",
      { url: doc.url, err },
    );
  }

  await logDocumentAudit(tenantId, dbUser.id, "DELETE", documentId, {
    contractId: doc.contractId,
  });

  if (doc.contractId) revalidatePath(`/contracts/${doc.contractId}`);
  revalidatePath("/contracts");
}
