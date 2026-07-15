import { z } from "zod";
import { ADDRESS_TEXT, CADASTRAL_KEY, SPANISH_TEXT } from "./patterns";

/** Acepta Date (input nativo), string ISO o vacío. Coerciona a Date u undefined. */
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

const PROPERTY_TYPE_VALUES = [
  "PLAZA_COMERCIAL",
  "TERRENO_RENTADO",
  "EDIFICIO",
  "OFICINA",
  "CASA",
  "BODEGA",
  "ESPECTACULAR",
  "OTRO",
] as const;

const PROPERTY_STATUS_VALUES = ["DISPONIBLE", "EN_RENTA", "BLOQUEADO"] as const;

export const createPropertySchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido.").max(50, "Máximo 50 caracteres.").regex(SPANISH_TEXT, "Solo letras, números y puntuación básica."),
  type: z.enum(PROPERTY_TYPE_VALUES, {
    message: "Selecciona el tipo de inmueble.",
  }),
  status: z.enum(PROPERTY_STATUS_VALUES).optional(),
  address: z.string().trim().min(1, "La dirección es requerida.").max(120, "Máximo 120 caracteres.").regex(ADDRESS_TEXT, "Solo letras, números y puntuación de dirección (#, °, etc.)."),
  ownerEntityId: z.string().min(1, "Selecciona la razón social dueña."),
  managerEntityId: z.string().min(1, "Selecciona la razón social administradora."),
  cadastralKey: z
    .string()
    .trim()
    .max(30, "Máximo 30 caracteres.")
    .regex(CADASTRAL_KEY, "Solo letras, números, guiones y diagonal.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  latitude: z
    .number({ message: "Latitud debe ser numérica." })
    .min(-90, "Latitud fuera de rango.")
    .max(90, "Latitud fuera de rango.")
    .optional(),
  longitude: z
    .number({ message: "Longitud debe ser numérica." })
    .min(-180, "Longitud fuera de rango.")
    .max(180, "Longitud fuera de rango.")
    .optional(),
  totalArea: z
    .number({ message: "Área debe ser numérica." })
    .positive("El área debe ser mayor a 0.")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Máximo 1000 caracteres.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  insuranceProvider: z
    .string()
    .trim()
    .max(80, "Máximo 80 caracteres.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  insurancePolicyNumber: z
    .string()
    .trim()
    .max(50, "Máximo 50 caracteres.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  insuranceExpiresAt: optionalDateLike,
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
