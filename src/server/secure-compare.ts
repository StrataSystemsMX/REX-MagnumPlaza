import { timingSafeEqual } from "node:crypto";

/**
 * Comparación de secretos en tiempo constante. `===` filtra información por
 * timing (se corta en el primer byte distinto). timingSafeEqual exige buffers
 * del mismo largo: si difieren, hacemos una comparación dummy para gastar un
 * tiempo equivalente y devolvemos false.
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compara contra sí mismo para gastar tiempo equivalente y no revelar
    // la longitud por una salida instantánea.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
