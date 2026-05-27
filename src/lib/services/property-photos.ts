"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  deleteFile,
  extractKeyFromUrl,
  r2KeyForPropertyPhoto,
  uploadFile,
} from "@/lib/storage/r2";
import {
  deletePropertyPhotoSchema,
  extensionForMime,
  uploadPropertyPhotoSchema,
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

export async function actionUploadPropertyPhoto(
  formData: FormData,
): Promise<{ id: string; url: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const propertyIdRaw = formData.get("propertyId");
  const fileRaw = formData.get("file");
  const { propertyId, file } = uploadPropertyPhotoSchema.parse({
    propertyId: propertyIdRaw,
    file: fileRaw,
  });

  // Tenant guardrail: la property debe existir en este tenant.
  await prisma.property.findFirstOrThrow({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });

  const ext = extensionForMime(file.type);
  const key = r2KeyForPropertyPhoto(tenantId, propertyId, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, backend } = await uploadFile(key, buffer, file.type);

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "PROPERTY_PHOTO",
      filename: file.name,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: dbUser.id,
      propertyId,
    },
    select: { id: true, url: true },
  });

  await logDocumentAudit(tenantId, dbUser.id, "CREATE", doc.id, {
    propertyId,
    backend,
    filename: file.name,
    sizeBytes: file.size,
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);

  return { id: doc.id, url: doc.url };
}

export async function actionDeletePropertyPhoto(input: {
  documentId: string;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const { documentId } = deletePropertyPhotoSchema.parse(input);

  // El filtro `type` evita borrar PDFs de contrato u otros documentos por error.
  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, tenantId, type: "PROPERTY_PHOTO" },
    select: { id: true, url: true, propertyId: true },
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
    console.error("[property-photos] R2 delete failed, file may be orphaned", {
      url: doc.url,
      err,
    });
  }

  await logDocumentAudit(tenantId, dbUser.id, "DELETE", documentId, {
    propertyId: doc.propertyId,
  });

  revalidatePath("/properties");
  if (doc.propertyId) revalidatePath(`/properties/${doc.propertyId}`);
}

/**
 * Reordena las fotos de un Property de forma masiva. Misma mecánica que el
 * equivalente de unit-photos.
 */
export async function actionReorderPropertyPhotos(input: {
  propertyId: string;
  orderedIds: string[];
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const { propertyId, orderedIds } = input;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error("Lista de orden vacía.");
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  if (!property) throw new Error("Inmueble no encontrado o fuera de tu tenant.");

  const photos = await prisma.document.findMany({
    where: { tenantId, propertyId, type: "PROPERTY_PHOTO" },
    select: { id: true },
  });
  const photoIds = new Set(photos.map((p) => p.id));
  if (orderedIds.length !== photoIds.size) {
    throw new Error("La lista no coincide con las fotos del inmueble.");
  }
  for (const id of orderedIds) {
    if (!photoIds.has(id)) {
      throw new Error("Foto inválida en la lista de orden.");
    }
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.document.updateMany({
        where: { id, tenantId, type: "PROPERTY_PHOTO" },
        data: { sortOrder: index },
      }),
    ),
  );

  await logDocumentAudit(tenantId, dbUser.id, "UPDATE", propertyId, {
    reorderedPhotos: orderedIds,
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
}
