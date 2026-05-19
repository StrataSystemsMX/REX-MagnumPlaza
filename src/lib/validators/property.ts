import { z } from "zod";

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

const PROPERTY_STATUS_VALUES = ["ACTIVO", "BLOQUEADO"] as const;

export const createPropertySchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido."),
  type: z.enum(PROPERTY_TYPE_VALUES, {
    message: "Selecciona el tipo de inmueble.",
  }),
  status: z.enum(PROPERTY_STATUS_VALUES).optional(),
  address: z.string().trim().min(1, "La dirección es requerida."),
  ownerEntityId: z.string().min(1, "Selecciona la razón social dueña."),
  managerEntityId: z.string().min(1, "Selecciona la razón social administradora."),
  cadastralKey: z
    .string()
    .trim()
    .max(40, "Máximo 40 caracteres.")
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
    .max(2000, "Máximo 2000 caracteres.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
