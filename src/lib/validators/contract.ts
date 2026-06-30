import { z } from "zod";

const CONTRACT_TYPE_VALUES = [
  "ARRENDAMIENTO",
  "COMODATO",
  "ADMINISTRACION_INTERNA",
  "COMPRAVENTA",
] as const;

const CONTRACT_STATUS_VALUES = [
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
  "CANCELLED",
  "PENDING_RENEWAL",
] as const;

/** Acepta Date (input nativo) o string ISO. Coerciona a Date. */
const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.length > 0) return new Date(v);
  return v;
}, z.date({ message: "Fecha inválida." }));

const optionalDateLike = z
  .preprocess(
    (v) => {
      if (v === null || v === "" || v === undefined) return undefined;
      if (v instanceof Date) return v;
      if (typeof v === "string") return new Date(v);
      return v;
    },
    z.date({ message: "Fecha inválida." }),
  )
  .optional();

export const createContractSchema = z
  .object({
    unitId: z.string().min(1, "Selecciona la unidad."),
    lesseeId: z.string().min(1, "Selecciona el inquilino."),
    type: z.enum(CONTRACT_TYPE_VALUES, { message: "Selecciona el tipo de contrato." }),
    startDate: dateLike,
    endDate: dateLike,
    monthlyAmount: z
      .number({ message: "Monto inválido." })
      .positive("La renta mensual debe ser mayor a 0."),
    guaranteeAmount: z
      .number({ message: "Monto inválido." })
      .nonnegative("El depósito no puede ser negativo."),
    paymentDay: z
      .number({ message: "Día de pago inválido." })
      .int("El día debe ser entero.")
      .min(1, "El día debe ser entre 1 y 28.")
      .max(28, "El día debe ser entre 1 y 28."),
    lateFeePercentage: z
      .number({ message: "Porcentaje inválido." })
      .min(0, "No puede ser negativo.")
      .max(100, "Máximo 100%.")
      .optional(),
    autoRenew: z.boolean().default(false),
    friendlyReminderEnabled: z.boolean().default(false),
    paidInAdvance: z.boolean().default(false),
    advancePaidUntil: optionalDateLike,
    signedDate: optionalDateLike,
    notes: z
      .string()
      .trim()
      .max(1000, "Máximo 1000 caracteres.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .refine((d) => d.endDate.getTime() > d.startDate.getTime(), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["endDate"],
  })
  .refine((d) => !d.paidInAdvance || d.advancePaidUntil !== undefined, {
    message: "Si el contrato está pagado por adelantado, indica hasta qué fecha.",
    path: ["advancePaidUntil"],
  });

export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = z.object({
  status: z.enum(CONTRACT_STATUS_VALUES, { message: "Estado inválido." }).optional(),
  type: z.enum(CONTRACT_TYPE_VALUES, { message: "Tipo de contrato inválido." }).optional(),
  startDate: optionalDateLike,
  endDate: optionalDateLike,
  monthlyAmount: z
    .number({ message: "Monto inválido." })
    .positive("La renta debe ser mayor a 0.")
    .optional(),
  guaranteeAmount: z
    .number({ message: "Monto inválido." })
    .nonnegative("El depósito no puede ser negativo.")
    .optional(),
  paymentDay: z
    .number()
    .int()
    .min(1)
    .max(28)
    .optional(),
  lateFeePercentage: z
    .number()
    .min(0)
    .max(100)
    .optional(),
  autoRenew: z.boolean().optional(),
  friendlyReminderEnabled: z.boolean().optional(),
  paidInAdvance: z.boolean().optional(),
  advancePaidUntil: optionalDateLike,
  signedDate: optionalDateLike,
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const terminateContractSchema = z.object({
  terminationDate: dateLike,
  reason: z
    .string()
    .trim()
    .min(1, "Indica el motivo de la terminación.")
    .max(1000, "Máximo 1000 caracteres."),
});

export type TerminateContractInput = z.infer<typeof terminateContractSchema>;

export const renewContractSchema = z
  .object({
    // Fecha de inicio explícita (no se asume el día siguiente al fin del padre):
    // editable después por retrasos en la firma.
    newStartDate: dateLike,
    newEndDate: dateLike,
    newAmount: z
      .number({ message: "Monto inválido." })
      .positive("La nueva renta debe ser mayor a 0."),
  })
  .refine((d) => d.newEndDate.getTime() > d.newStartDate.getTime(), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["newEndDate"],
  });

export type RenewContractInput = z.infer<typeof renewContractSchema>;
