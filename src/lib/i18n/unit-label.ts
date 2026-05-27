import type { PropertyType } from "@/generated/prisma/enums";

// Solo las plazas comerciales agrupan varios locales, así que solo ahí tiene
// sentido mostrar un código de local ("L1", "LP", etc.). Un inmueble individual
// (oficina, bodega, edificio, espectacular...) ES en sí mismo el espacio
// rentable: no tiene un "local principal", por eso mostramos su nombre.
const PLAZA_TYPE: PropertyType = "PLAZA_COMERCIAL";

export interface UnitLabelInput {
  code: string;
  name?: string | null;
  childUnits?: ReadonlyArray<{ code: string }> | null;
  property: { name: string; type: PropertyType };
}

export function isPlaza(type: PropertyType): boolean {
  return type === PLAZA_TYPE;
}

/**
 * Código crudo de la unidad, agrupando locales hijos (p. ej. "L1-L2") cuando los
 * hay. Úsalo solo donde de verdad importa el código del local (formularios,
 * títulos de fotos de un local concreto), no para identificar la unidad ante el
 * usuario: para eso está {@link unitLabel}.
 */
export function unitCode(unit: {
  code: string;
  childUnits?: ReadonlyArray<{ code: string }> | null;
}): string {
  const children = unit.childUnits ?? [];
  if (children.length === 0) return unit.code;
  return [unit.code, ...children.map((c) => c.code)].sort().join("-");
}

/**
 * Identidad de la unidad para mostrar al usuario, sin el nombre del inmueble.
 * - Plaza comercial: el código del local ("L1"), con su nombre si `withName`.
 * - Inmueble individual: el nombre del inmueble (el inmueble es el espacio
 *   rentable), en lugar de un código genérico tipo "LP".
 */
export function unitLabel(unit: UnitLabelInput, opts?: { withName?: boolean }): string {
  if (!isPlaza(unit.property.type)) {
    return unit.property.name;
  }
  const code = unitCode(unit);
  if (opts?.withName && unit.name) return `${code} — ${unit.name}`;
  return code;
}

/**
 * Etiqueta combinada "Inmueble · Local" para listas donde se muestran ambos.
 * En inmuebles individuales no duplicamos: devolvemos solo el nombre del
 * inmueble. El separador es configurable ("·", "—", " ", etc.).
 */
export function unitWithProperty(unit: UnitLabelInput, separator = " · "): string {
  if (!isPlaza(unit.property.type)) {
    return unit.property.name;
  }
  return `${unit.property.name}${separator}${unitCode(unit)}`;
}
