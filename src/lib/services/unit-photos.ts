"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  deleteFile,
  extractKeyFromUrl,
  r2KeyForUnitPhoto,
  uploadFile,
} from "@/lib/storage/r2";
import {
  deleteUnitPhotoSchema,
  extensionForMime,
  uploadUnitPhotoSchema,
} from "@/lib/validators/document";
import type { Prisma } from "@/generated/prisma/client";

async function logDocumentAudit(
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
      entityType: "Document",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

export async function actionUploadUnitPhoto(
  formData: FormData,
): Promise<{ id: string; url: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const unitIdRaw = formData.get("unitId");
  const fileRaw = formData.get("file");
  const { unitId, file } = uploadUnitPhotoSchema.parse({
    unitId: unitIdRaw,
    file: fileRaw,
  });

  // Tenant guardrail: la unit debe existir en este tenant.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { id: unitId, tenantId },
    select: { id: true, propertyId: true },
  });

  const ext = extensionForMime(file.type);
  const key = r2KeyForUnitPhoto(tenantId, unitId, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, backend } = await uploadFile(key, buffer, file.type);

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "UNIT_PHOTO",
      filename: file.name,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: dbUser.id,
      unitId,
    },
    select: { id: true, url: true },
  });

  await logDocumentAudit(tenantId, dbUser.id, "CREATE", doc.id, {
    unitId,
    backend,
    filename: file.name,
    sizeBytes: file.size,
  });

  revalidatePath(`/properties/${unit.propertyId}`);

  return { id: doc.id, url: doc.url };
}

export async function actionDeleteUnitPhoto(input: {
  documentId: string;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const { documentId } = deleteUnitPhotoSchema.parse(input);

  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, tenantId, type: "UNIT_PHOTO" },
    select: {
      id: true,
      url: true,
      unitId: true,
      unit: { select: { propertyId: true } },
    },
  });

  const result = await prisma.document.deleteMany({
    where: { id: documentId, tenantId },
  });
  if (result.count === 0) {
    throw new Error("Foto no encontrada o fuera de tu tenant.");
  }

  // Best-effort: si R2 falla, dejamos huérfano y seguimos.
  try {
    await deleteFile(extractKeyFromUrl(doc.url));
  } catch (err) {
    console.error("[unit-photos] R2 delete failed, file may be orphaned", {
      url: doc.url,
      err,
    });
  }

  await logDocumentAudit(tenantId, dbUser.id, "DELETE", documentId, {
    unitId: doc.unitId,
  });

  if (doc.unit?.propertyId) {
    revalidatePath(`/properties/${doc.unit.propertyId}`);
  }
}

/**
 * Reordena las fotos de un Unit de forma masiva. `orderedIds` es la lista
 * completa de Document.id en el orden deseado (0 = portada). Valida que TODOS
 * los ids pertenezcan a fotos del mismo unit + tenant antes de aplicar.
 */
export async function actionReorderUnitPhotos(input: {
  unitId: string;
  orderedIds: string[];
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const { unitId, orderedIds } = input;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error("Lista de orden vacía.");
  }

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, tenantId },
    select: { id: true, propertyId: true },
  });
  if (!unit) throw new Error("Unit no encontrada o fuera de tu tenant.");

  const photos = await prisma.document.findMany({
    where: { tenantId, unitId, type: "UNIT_PHOTO" },
    select: { id: true },
  });
  const photoIds = new Set(photos.map((p) => p.id));
  if (orderedIds.length !== photoIds.size) {
    throw new Error("La lista no coincide con las fotos del local.");
  }
  for (const id of orderedIds) {
    if (!photoIds.has(id)) {
      throw new Error("Foto inválida en la lista de orden.");
    }
  }

  // updateMany (no update) para satisfacer el tenant guardrail — el where
  // necesita incluir tenantId. Cada llamada afecta 0 o 1 fila (id es único).
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.document.updateMany({
        where: { id, tenantId, type: "UNIT_PHOTO" },
        data: { sortOrder: index },
      }),
    ),
  );

  await logDocumentAudit(tenantId, dbUser.id, "UPDATE", unitId, {
    reorderedPhotos: orderedIds,
  });

  revalidatePath(`/properties/${unit.propertyId}`);
}
