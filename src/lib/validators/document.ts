import { z } from "zod";

export const MAX_PROPERTY_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

export const ALLOWED_PROPERTY_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedPropertyPhotoMime =
  (typeof ALLOWED_PROPERTY_PHOTO_MIME_TYPES)[number];

const ALLOWED_LIST = ALLOWED_PROPERTY_PHOTO_MIME_TYPES as readonly string[];

export const propertyPhotoFileSchema = z
  .instanceof(File, { message: "Archivo inválido." })
  .refine(
    (f) => ALLOWED_LIST.includes(f.type),
    "Solo se permiten imágenes JPG, PNG o WebP.",
  )
  .refine(
    (f) => f.size > 0,
    "El archivo está vacío.",
  )
  .refine(
    (f) => f.size <= MAX_PROPERTY_PHOTO_SIZE_BYTES,
    "La imagen no debe pesar más de 8 MB.",
  );

export const uploadPropertyPhotoSchema = z.object({
  propertyId: z.string().min(1, "propertyId requerido."),
  file: propertyPhotoFileSchema,
});

export type UploadPropertyPhotoInput = z.infer<typeof uploadPropertyPhotoSchema>;

export const deletePropertyPhotoSchema = z.object({
  documentId: z.string().min(1, "documentId requerido."),
});

export type DeletePropertyPhotoInput = z.infer<typeof deletePropertyPhotoSchema>;

export const uploadUnitPhotoSchema = z.object({
  unitId: z.string().min(1, "unitId requerido."),
  file: propertyPhotoFileSchema,
});

export type UploadUnitPhotoInput = z.infer<typeof uploadUnitPhotoSchema>;

export const deleteUnitPhotoSchema = z.object({
  documentId: z.string().min(1, "documentId requerido."),
});

export type DeleteUnitPhotoInput = z.infer<typeof deleteUnitPhotoSchema>;

export const MAX_CONTRACT_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_CONTRACT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
] as const;

export type AllowedContractDocumentMime =
  (typeof ALLOWED_CONTRACT_DOCUMENT_MIME_TYPES)[number];

const ALLOWED_CONTRACT_DOC_LIST =
  ALLOWED_CONTRACT_DOCUMENT_MIME_TYPES as readonly string[];

export const contractDocumentFileSchema = z
  .instanceof(File, { message: "Archivo inválido." })
  .refine(
    (f) => ALLOWED_CONTRACT_DOC_LIST.includes(f.type),
    "Solo se permiten archivos PDF.",
  )
  .refine((f) => f.size > 0, "El archivo está vacío.")
  .refine(
    (f) => f.size <= MAX_CONTRACT_DOCUMENT_SIZE_BYTES,
    "El archivo no debe pesar más de 10 MB.",
  );

export const uploadContractDocumentSchema = z.object({
  contractId: z.string().min(1, "contractId requerido."),
  file: contractDocumentFileSchema,
});

export type UploadContractDocumentInput = z.infer<
  typeof uploadContractDocumentSchema
>;

export const deleteContractDocumentSchema = z.object({
  documentId: z.string().min(1, "documentId requerido."),
});

export type DeleteContractDocumentInput = z.infer<
  typeof deleteContractDocumentSchema
>;

export function extensionForMime(mime: string): "jpg" | "png" | "webp" {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`MIME no soportado: ${mime}`);
  }
}

export function extensionForContractDocumentMime(mime: string): "pdf" {
  if (mime === "application/pdf") return "pdf";
  throw new Error(`MIME no soportado para contrato: ${mime}`);
}
