import { Prisma } from "@/generated/prisma/client";

/**
 * Mapea recursivamente `Prisma.Decimal` → `string` en un tipo. Mantiene `Date`
 * y demás primitivos. Útil para tipar props que cruzan el límite Server →
 * Client Component, donde Decimal no es serializable y debe ir como string.
 */
export type Serialized<T> = T extends Prisma.Decimal
  ? string
  : T extends Date
    ? Date
    : T extends Array<infer U>
      ? Array<Serialized<U>>
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<Serialized<U>>
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;

/**
 * Convierte recursivamente todas las instancias de `Prisma.Decimal` a `string`
 * dentro de objetos/arrays anidados. Ejecuta una sola pasada y preserva Date,
 * null/undefined y primitivos. Pensado para usarse en el límite de un page
 * Server Component antes de pasar datos a un Client Component.
 */
export function serializeDecimals<T>(value: T): Serialized<T> {
  return walk(value) as Serialized<T>;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = walk((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
