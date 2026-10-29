import { z } from "zod";
import { IncludedService, UnitStatus } from "@/generated/prisma/enums";
import { IDENTIFIER_CODE, SPANISH_TEXT } from "./patterns";

export const createUnitSchema = z.object({
  propertyId: z.string().min(1, "El inmueble es requerido."),
  code: z
    .string()
    .trim()
    .min(1, "El identificador es requerido.")
    .max(20, "Máximo 20 caracteres.")
    .regex(IDENTIFIER_CODE, "Solo letras, números, guión y guión bajo."),
  name: z
    .string()
    .trim()
    .max(50, "Máximo 50 caracteres.")
    .regex(SPANISH_TEXT, "Solo letras, números y puntuación básica.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  area: z
    .number({ message: "Área debe ser numérica." })
    .positive("El área debe ser mayor a 0.")
    .optional(),
  estimatedRent: z
    .number({ message: "La renta estimada debe ser numérica." })
    .nonnegative("La renta no puede ser negativa.")
    .optional(),
  status: z.nativeEnum(UnitStatus, { message: "Selecciona el estado." }),
  depositMonths: z
    .number({ message: "Debe ser numérico." })
    .int("Solo meses completos.")
    .min(0, "No puede ser negativo.")
    .max(36, "Máximo 36 meses.")
    .optional(),
  minContractMonths: z
    .number({ message: "Debe ser numérico." })
    .int("Solo meses completos.")
    .min(0, "No puede ser negativo.")
    .max(120, "Máximo 120 meses.")
    .optional(),
  maintenanceFee: z
    .number({ message: "Debe ser numérico." })
    .nonnegative("No puede ser negativo.")
    .optional(),
  availableFrom: z.coerce.date().optional(),
  includedServices: z.array(z.nativeEnum(IncludedService)).optional(),
  parentUnitId: z.string().min(1).nullable().optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Máximo 1000 caracteres.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = createUnitSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
