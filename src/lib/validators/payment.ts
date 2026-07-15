import { z } from "zod";

const PAYMENT_METHOD_VALUES = [
  "CASH",
  "TRANSFER",
  "CHECK",
  "DEPOSIT",
  "CARD",
  "OTHER",
] as const;

const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.length > 0) return new Date(v);
  return v;
}, z.date({ message: "Fecha inválida." }));

const optionalString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const registerPaymentSchema = z.object({
  rentId: z.string().min(1, "Selecciona la renta a pagar."),
  amount: z
    .number({ message: "Monto inválido." })
    .positive("El monto debe ser mayor a 0."),
  paymentDate: dateLike,
  method: z.enum(PAYMENT_METHOD_VALUES, { message: "Método inválido." }),
  reference: optionalString(120, "Máximo 120 caracteres."),
  notes: optionalString(2000, "Máximo 2000 caracteres."),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/**
 * Edición de un pago ya capturado (corrección de errores de captura). No cambia
 * la renta a la que pertenece; solo monto/fecha/método/referencia/notas. El
 * status de la renta se recalcula tras editar.
 */
export const editPaymentSchema = z.object({
  amount: z
    .number({ message: "Monto inválido." })
    .positive("El monto debe ser mayor a 0."),
  paymentDate: dateLike,
  method: z.enum(PAYMENT_METHOD_VALUES, { message: "Método inválido." }),
  reference: optionalString(120, "Máximo 120 caracteres."),
  notes: optionalString(2000, "Máximo 2000 caracteres."),
});

export type EditPaymentInput = z.infer<typeof editPaymentSchema>;

export const waiveRentsSchema = z.object({
  items: z
    .array(
      z.object({
        rentId: z.string().min(1, "Identificador de renta inválido."),
        amount: z
          .number({ message: "Monto inválido." })
          .nonnegative("El monto no puede ser negativo."),
      }),
    )
    .min(1, "Selecciona al menos una renta para condonar."),
  reason: z
    .string()
    .trim()
    .min(5, "Indica el motivo de la condonación (mínimo 5 caracteres).")
    .max(500, "Máximo 500 caracteres."),
});

export type WaiveRentsInput = z.infer<typeof waiveRentsSchema>;

/**
 * Pago "bulk" — un movimiento de dinero (transferencia, depósito) que cubre
 * varias rentas en una sola operación. La suma de splitByRent debe igualar
 * al monto total. Se generan N Payments compartiendo paymentDate/method/reference.
 */
export const bulkPaymentSchema = z
  .object({
    lesseeId: z.string().min(1, "Selecciona el inquilino."),
    amount: z
      .number({ message: "Monto inválido." })
      .positive("El monto debe ser mayor a 0."),
    paymentDate: dateLike,
    method: z.enum(PAYMENT_METHOD_VALUES, { message: "Método inválido." }),
    reference: optionalString(120, "Máximo 120 caracteres."),
    notes: optionalString(2000, "Máximo 2000 caracteres."),
    splitByRent: z
      .array(
        z.object({
          rentId: z.string().min(1),
          amount: z
            .number({ message: "Monto inválido." })
            .positive("El monto por renta debe ser mayor a 0."),
        }),
      )
      .min(1, "Selecciona al menos una renta a pagar."),
  })
  .refine(
    (d) => {
      const sum = d.splitByRent.reduce((acc, s) => acc + s.amount, 0);
      // tolerancia para errores de redondeo en floats
      return Math.abs(sum - d.amount) < 0.01;
    },
    {
      message: "La suma de los montos por renta no coincide con el monto total.",
      path: ["splitByRent"],
    },
  );

export type BulkPaymentInput = z.infer<typeof bulkPaymentSchema>;
