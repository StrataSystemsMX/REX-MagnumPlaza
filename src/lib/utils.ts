import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Intl.DateTimeFormat con locale es-* devuelve los meses en minúscula
// (p.ej. "mayo de 2026"). El producto siempre muestra el mes con la primera
// letra en mayúscula, por lo que cualquier salida que incluya el mes debe
// pasar por este helper.
export function capitalizeFirst(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
