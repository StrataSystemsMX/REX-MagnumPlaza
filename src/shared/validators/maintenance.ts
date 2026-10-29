import { z } from "zod";
import {
  MaintenanceResponsibility,
  MaintenanceStatus,
  MaintenanceType,
} from "@/generated/prisma/enums";
import { SPANISH_TEXT } from "./patterns";

// El `.optional()` externo es necesario en Zod v4: un `z.preprocess` sin él
// rechaza la llave ausente ("expected nonoptional") aunque su schema interno
// sea opcional.
const dateLike = z
  .preprocess((v) => {
    if (v instanceof Date) return v;
    if (typeof v === "string" && v.length > 0) return new Date(v);
    return undefined;
  }, z.date({ message: "Fecha inválida." }).optional())
  .optional();

const optionalAmount = z.preprocess(
  (v) => {
    if (v === null || v === "" || v === undefined) return undefined;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  },
  z.number().positive("El costo debe ser mayor a 0.").optional(),
).optional();

export const createMaintenanceSchema = z.object({
  propertyId: z.string().min(1, "Selecciona una propiedad."),
  unitId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1, "Describe el mantenimiento.").max(80).regex(SPANISH_TEXT, "Solo letras, números y puntuación básica."),
  description: z.string().max(1000).optional().nullable(),
  type: z.nativeEnum(MaintenanceType),
  responsibility: z.nativeEnum(MaintenanceResponsibility),
  scheduledDate: dateLike,
  vendor: z.string().trim().max(100).regex(SPANISH_TEXT, "Solo letras, números y puntuación básica.").optional().nullable(),
  cost: optionalAmount,
  isRecurring: z.boolean().default(false),
  notes: z.string().max(300).optional().nullable(),
});
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;

export const updateMaintenanceStatusSchema = z.object({
  maintenanceId: z.string().min(1),
  status: z.nativeEnum(MaintenanceStatus),
  completedDate: dateLike,
  cost: optionalAmount,
  notes: z.string().max(300).optional().nullable(),
});
export type UpdateMaintenanceStatusInput = z.infer<typeof updateMaintenanceStatusSchema>;

export const updateMaintenanceSchema = z.object({
  maintenanceId: z.string().min(1),
  propertyId: z.string().min(1, "Selecciona una propiedad."),
  unitId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1, "Describe el mantenimiento.").max(80).regex(SPANISH_TEXT, "Solo letras, números y puntuación básica."),
  description: z.string().max(1000).optional().nullable(),
  type: z.nativeEnum(MaintenanceType),
  responsibility: z.nativeEnum(MaintenanceResponsibility),
  status: z.nativeEnum(MaintenanceStatus),
  scheduledDate: dateLike,
  vendor: z.string().trim().max(100).regex(SPANISH_TEXT, "Solo letras, números y puntuación básica.").optional().nullable(),
  cost: optionalAmount,
  notes: z.string().max(300).optional().nullable(),
});
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
