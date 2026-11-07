/**
 * Catálogo de roles, permisos y su asignación por rol. Fuente única de verdad,
 * aplicada por `prisma/catalog-sync.ts` desde el seed, `sync-permissions.ts`
 * y `bootstrap-production.ts` (los dos últimos sobre una base existente sin
 * re-correr el seed completo, que recrea el tenant).
 *
 * Los códigos deben coincidir con los usados en requirePermission(...) en
 * src/server/services. MASTER hace bypass en hasPermission, no necesita filas.
 */
import type { RoleCode } from "../src/generated/prisma/enums";

export const ROLES: { code: RoleCode; name: string; description: string }[] = [
  { code: "MASTER", name: "Master", description: "Acceso total. Autoriza decisiones críticas." },
  { code: "ADMIN", name: "Administrador", description: "Operación completa con permisos granulares." },
  {
    code: "ACCOUNTANT",
    name: "Contador",
    description: "Solo lectura financiera, exporta para despacho contable.",
  },
  { code: "OWNER", name: "Dueño", description: "Solo consulta (read-only) de vistas operativas." },
  { code: "PROMOTER", name: "Promotor", description: "Externo, ve solo inmuebles asignados." },
  { code: "LESSEE", name: "Inquilino", description: "Inquilino, ve su estado de cuenta." },
];

export const PERMISSIONS: { code: string; name: string }[] = [
  { code: "property.create", name: "Crear inmuebles" },
  { code: "property.update", name: "Editar inmuebles" },
  { code: "property.delete", name: "Eliminar inmuebles" },
  { code: "unit.create", name: "Crear unidades" },
  { code: "unit.update", name: "Editar unidades" },
  { code: "unit.delete", name: "Eliminar unidades" },
  { code: "contract.create", name: "Crear contratos" },
  { code: "contract.update", name: "Editar contratos" },
  { code: "lessee.view", name: "Ver inquilinos" },
  { code: "lessee.create", name: "Crear inquilinos" },
  { code: "lessee.update", name: "Editar inquilinos" },
  { code: "lessee.delete", name: "Eliminar inquilinos" },
  { code: "payment.register", name: "Registrar pagos" },
  // payment.delete NO se siembra a propósito: borrar pagos es MASTER-only
  // vía gate explícito isMaster() en actionDeletePayment.
  { code: "expense.create", name: "Crear egresos" },
  { code: "expense.update", name: "Editar egresos" },
  { code: "expense.delete", name: "Eliminar egresos" },
  // Permisos propios por módulo (antes reusaban expense.* y no permitían
  // granularidad por rol).
  { code: "guarantee.create", name: "Registrar depósitos en garantía" },
  { code: "guarantee.update", name: "Devolver / editar depósitos en garantía" },
  { code: "promoter.create", name: "Crear promotores y ligas públicas" },
  { code: "promoter.update", name: "Editar promotores y ligas públicas" },
  { code: "budget.create", name: "Crear presupuestos" },
  { code: "budget.update", name: "Editar presupuestos" },
  { code: "budget.delete", name: "Eliminar líneas de presupuesto" },
  { code: "cadastral.create", name: "Registrar prediales" },
  { code: "cadastral.update", name: "Editar / pagar prediales" },
  { code: "cadastral.delete", name: "Eliminar prediales" },
  { code: "payroll.create", name: "Registrar nóminas" },
  { code: "payroll.update", name: "Editar nóminas" },
  { code: "payroll.delete", name: "Eliminar nóminas" },
  { code: "maintenance.create", name: "Crear mantenimientos" },
  { code: "maintenance.update", name: "Editar mantenimientos" },
  { code: "investment.create", name: "Crear proyectos de inversión" },
  { code: "investment.update", name: "Registrar pagos de inversión" },
  { code: "loan.create", name: "Crear préstamos" },
  { code: "notification.retry", name: "Reintentar notificaciones" },
];

/** Read-only: solo consulta. Las vistas financieras se gatean por rol aparte. */
export const READ_ONLY_CODES: string[] = ["lessee.view"];

/**
 * Asignación por rol (claves = RoleCode). ADMIN opera todo; MASTER no
 * necesita filas (bypass).
 */
export const ROLE_PERMISSION_CODES: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => p.code),
  ACCOUNTANT: READ_ONLY_CODES,
  OWNER: READ_ONLY_CODES,
};
