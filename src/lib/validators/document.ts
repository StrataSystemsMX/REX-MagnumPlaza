import { z } from "zod";

export const MAX_PROPERTY_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

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
    "La imagen no debe pesar más de 5 MB.",
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
