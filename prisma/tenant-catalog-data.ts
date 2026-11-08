/**
 * Catálogo de configuración del tenant de Plazas Magnum: razones sociales y
 * categorías de egreso. Fuente única compartida entre `prisma/seed.ts` (datos
 * de desarrollo) y `prisma/bootstrap-production.ts` (arranque de producción
 * sin datos operativos).
 */
import { ExpenseType } from "../src/generated/prisma/enums";

export const TENANT_SLUG = "plazas-magnum";
export const TENANT_NAME = "Plazas Magnum";

export type EntityCode = "CRT" | "TSR" | "QHS" | "JCL" | "CLICK";

export const LEGAL_ENTITIES: {
  code: EntityCode;
  legalName: string;
  isOperator: boolean;
}[] = [
  { code: "CRT", legalName: "CRT Desarrollo y Proyectos S.A. de C.V.", isOperator: true },
  { code: "TSR", legalName: "TSR Inmobiliaria S.A. de C.V.", isOperator: true },
  { code: "QHS", legalName: "QHS S.A. de C.V.", isOperator: false },
  // JCL = Juan Carlos L (persona física). Razón social registrada por
  // completitud; sus propiedades personales no se administran en Rex.
  { code: "JCL", legalName: "Juan Carlos L", isOperator: false },
  // CLICK: razón social satélite usada en el bloque de nóminas del Excel.
  // Factura servicios administrativos (OSC) y paga "Nómina Vinculación".
  { code: "CLICK", legalName: "Click S.A. de C.V.", isOperator: true },
];

export const EXPENSE_CATEGORIES: {
  code: string;
  name: string;
  type: (typeof ExpenseType)[keyof typeof ExpenseType];
  isRecurring: boolean;
}[] = [
  // Nóminas
  {
    code: "NOMINA_DIRECCION",
    name: "Nómina Dirección",
    type: ExpenseType.PAYROLL,
    isRecurring: true,
  },
  {
    code: "NOMINA_GENERAL",
    name: "Nómina General",
    type: ExpenseType.PAYROLL,
    isRecurring: true,
  },
  { code: "HONORARIOS", name: "Honorarios", type: ExpenseType.PAYROLL, isRecurring: true },
  // Impuestos
  { code: "PREDIAL", name: "Predial", type: ExpenseType.TAX, isRecurring: true },
  { code: "SAT", name: "SAT", type: ExpenseType.TAX, isRecurring: true },
  { code: "IMSS_INFONAVIT", name: "IMSS / Infonavit", type: ExpenseType.TAX, isRecurring: true },
  {
    code: "ISRTP",
    name: "ISR sobre Producto del Trabajo",
    type: ExpenseType.TAX,
    isRecurring: true,
  },
  { code: "PLACAS", name: "Placas vehiculares", type: ExpenseType.TAX, isRecurring: true },
  // Servicios
  {
    code: "CFE",
    name: "Comisión Federal de Electricidad",
    type: ExpenseType.UTILITY,
    isRecurring: true,
  },
  { code: "AGUA", name: "Agua", type: ExpenseType.UTILITY, isRecurring: true },
  { code: "TELMEX", name: "Telmex", type: ExpenseType.UTILITY, isRecurring: true },
  { code: "TELCEL", name: "Telcel", type: ExpenseType.UTILITY, isRecurring: true },
  {
    code: "SANISO_BASURA",
    name: "Saniso / Recolección de basura",
    type: ExpenseType.UTILITY,
    isRecurring: true,
  },
  { code: "ALARMA", name: "Alarma / monitoreo", type: ExpenseType.UTILITY, isRecurring: true },
  // Mantenimiento
  {
    code: "MANTENIMIENTO_PLAZAS",
    name: "Mantenimiento de plazas",
    type: ExpenseType.MAINTENANCE,
    isRecurring: false,
  },
  { code: "LIMPIEZA", name: "Limpieza", type: ExpenseType.MAINTENANCE, isRecurring: true },
  // Vehículos
  {
    code: "FINANCIAMIENTO_TOYOTA",
    name: "Financiamiento Toyota",
    type: ExpenseType.VEHICLE,
    isRecurring: true,
  },
  {
    code: "FINANCIAMIENTO_EXPEDITION",
    name: "Financiamiento Expedition",
    type: ExpenseType.VEHICLE,
    isRecurring: true,
  },
  {
    code: "FINANCIAMIENTO_BMW",
    name: "Financiamiento BMW",
    type: ExpenseType.VEHICLE,
    isRecurring: true,
  },
  { code: "GASOLINA", name: "Gasolina", type: ExpenseType.VEHICLE, isRecurring: true },
  {
    code: "SERVICIOS_AUTOS",
    name: "Servicios de autos",
    type: ExpenseType.VEHICLE,
    isRecurring: false,
  },
  // Otros
  {
    code: "SEGUROS_INMUEBLES",
    name: "Seguros de inmuebles",
    type: ExpenseType.INSURANCE,
    isRecurring: true,
  },
  {
    code: "SEGURO_AUTOMOTRIZ",
    name: "Seguro automotriz",
    type: ExpenseType.INSURANCE,
    isRecurring: true,
  },
  {
    code: "COMISIONES_BANCARIAS",
    name: "Comisiones bancarias",
    type: ExpenseType.BANK_FEE,
    isRecurring: true,
  },
  { code: "PAPELERIA", name: "Papelería", type: ExpenseType.OFFICE, isRecurring: false },
  {
    code: "CONSUMO_OFICINA",
    name: "Consumo de oficina (bebidas, botanas, limpieza)",
    type: ExpenseType.OFFICE,
    isRecurring: true,
  },
  { code: "CAJA_CHICA", name: "Caja chica", type: ExpenseType.OFFICE, isRecurring: true },
  {
    code: "LICENCIAS_PERMISOS",
    name: "Licencias, permisos y comisiones",
    type: ExpenseType.OTHER,
    isRecurring: false,
  },
  { code: "OTROS", name: "Otros", type: ExpenseType.OTHER, isRecurring: false },
];
