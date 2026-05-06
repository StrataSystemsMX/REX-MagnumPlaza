import { z } from "zod";

const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.length > 0) return new Date(v);
  return v;
}, z.date({ message: "Fecha inválida." }));

const optionalAmount = z
  .preprocess(
    (v) => {
      if (v === null || v === "" || v === undefined) return undefined;
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : v;
      }
      return v;
    },
    z.number({ message: "Monto inválido." }).nonnegative("El monto no puede ser negativo."),
  )
  .optional();

const NOW_YEAR = new Date().getUTCFullYear();
const yearSchema = z
  .number({ message: "Año inválido." })
  .int()
  .gte(2000, "Año demasiado antiguo.")
  .lte(NOW_YEAR + 5, "Año demasiado lejano.");

const baseCadastralFields = {
  propertyId: z.string().min(1, "Selecciona el inmueble."),
  year: yearSchema,
  totalAmount: optionalAmount,
  dueDate: dateLike,
  payerEntityId: z.string().min(1).optional().nullable(),
  paidByThirdPartyName: z
    .string()
    .trim()
    .max(80, "Máximo 80 caracteres.")
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
};

const exclusivePayer = (d: {
  payerEntityId?: string | null;
  paidByThirdPartyName?: string | null;
}) => !(d.payerEntityId && d.paidByThirdPartyName);

const exclusivePayerError = {
  message: "Selecciona razón social del tenant o tercero externo, no ambos.",
  path: ["paidByThirdPartyName"],
};

export const createCadastralPaymentSchema = z
  .object(baseCadastralFields)
  .refine(exclusivePayer, exclusivePayerError);

export type CreateCadastralPaymentInput = z.infer<
  typeof createCadastralPaymentSchema
>;

export const updateCadastralPaymentSchema = z
  .object({ ...baseCadastralFields, id: z.string().min(1, "id requerido.") })
  .refine(exclusivePayer, exclusivePayerError);

export type UpdateCadastralPaymentInput = z.infer<
  typeof updateCadastralPaymentSchema
>;

export const registerCadastralPaymentSchema = z.object({
  id: z.string().min(1, "id requerido."),
  paidAmount: z
    .number({ message: "Monto inválido." })
    .positive("El monto pagado debe ser mayor a 0."),
  paymentDate: dateLike,
  notes: z.string().max(500).optional().nullable(),
});

export type RegisterCadastralPaymentInput = z.infer<
  typeof registerCadastralPaymentSchema
>;

export const unmarkCadastralPaymentSchema = z.object({
  id: z.string().min(1, "id requerido."),
});

export type UnmarkCadastralPaymentInput = z.infer<
  typeof unmarkCadastralPaymentSchema
>;

export const deleteCadastralPaymentSchema = z.object({
  id: z.string().min(1, "id requerido."),
});

export type DeleteCadastralPaymentInput = z.infer<
  typeof deleteCadastralPaymentSchema
>;

export const MAX_CADASTRAL_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_CADASTRAL_RECEIPT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

const ALLOWED_RECEIPT_LIST =
  ALLOWED_CADASTRAL_RECEIPT_MIME_TYPES as readonly string[];

export const cadastralReceiptFileSchema = z
  .instanceof(File, { message: "Archivo inválido." })
  .refine(
    (f) => ALLOWED_RECEIPT_LIST.includes(f.type),
    "Solo se permiten PDF, JPG o PNG.",
  )
  .refine((f) => f.size > 0, "El archivo está vacío.")
  .refine(
    (f) => f.size <= MAX_CADASTRAL_RECEIPT_SIZE_BYTES,
    "El archivo no debe pesar más de 10 MB.",
  );

export const uploadCadastralReceiptSchema = z.object({
  cadastralPaymentId: z.string().min(1, "cadastralPaymentId requerido."),
  file: cadastralReceiptFileSchema,
});

export type UploadCadastralReceiptInput = z.infer<
  typeof uploadCadastralReceiptSchema
>;

export const deleteCadastralReceiptSchema = z.object({
  documentId: z.string().min(1, "documentId requerido."),
});

export type DeleteCadastralReceiptInput = z.infer<
  typeof deleteCadastralReceiptSchema
>;

export function extensionForCadastralReceiptMime(
  mime: string,
): "pdf" | "jpg" | "png" {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      throw new Error(`MIME no soportado para boleta: ${mime}`);
  }
}
