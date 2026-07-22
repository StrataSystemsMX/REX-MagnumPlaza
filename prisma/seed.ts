import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  BudgetConceptType,
  ContractStatus,
  ContractType,
  DocumentType,
  ExpenseType,
  GuaranteeStatus,
  InvestmentProjectStatus,
  LoanStatus,
  LoanType,
  PaymentMethod,
  Plan,
  PropertyStatus,
  PropertyType,
  RentStatus,
  RoleCode,
  UnitStatus,
} from "../src/generated/prisma/enums";
import { PERMISSIONS, ROLE_PERMISSION_CODES } from "./permissions-data";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definido. Copia .env.example a .env.local y configura la conexión.",
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ============================================================================
// CONFIG
// ============================================================================

const TENANT_SLUG = "plazas-magnum";
const YEAR = 2026;
const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);

const CONTRACT_START = utcDate(YEAR, 0, 1); // 2026-01-01
const CONTRACT_END = utcDate(YEAR, 11, 31); // 2026-12-31
const SIGNED = utcDate(2025, 11, 15); // diciembre 2025

type EntityCode = "CRT" | "TSR" | "QHS" | "JCL" | "CLICK";

type PaymentEntry =
  | { kind: "paid"; amount?: number }
  | { kind: "partial"; amount: number }
  | { kind: "unpaid" };

interface UnitDef {
  code: string;
  name?: string;
  /** Si está vacante, no se crea ni Lessee ni Contract. */
  vacant?: boolean;
  /** Renta mensual. Requerido si no es vacante. */
  monthlyAmount?: number;
  unitNotes?: string;
  lessee?: {
    legalName: string;
    contactName?: string;
    rfc?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  contractNotes?: string;
  /** Para Bluecell: paga adelantado hasta esta fecha. */
  paidInAdvance?: boolean;
  advancePaidUntil?: Date;
  /**
   * Si está definido, los meses 0..N (Ene..N) se marcan PAID
   * sin importar la fecha actual (caso pago adelantado).
   */
  paidThroughMonth?: number;
  /** Override de fecha de inicio del contrato. */
  contractStartDate?: Date;
  /** Override de fecha de fin del contrato. */
  contractEndDate?: Date;
  /** Genera Rents desde este mes (0..11). Default 0 = Ene. */
  rentStartMonth?: number;
  /** Genera Rents hasta este mes (0..11). Default 11 = Dic. */
  rentEndMonth?: number;
  /** Estado de pago por mes (0..11). Para meses pasados sin entrada → UNPAID. */
  payments?: Partial<Record<number, PaymentEntry>>;
}

const PAID_Q1: Partial<Record<number, PaymentEntry>> = {
  0: { kind: "paid" },
  1: { kind: "paid" },
  2: { kind: "paid" },
};

interface PropertyDef {
  name: string;
  type: (typeof PropertyType)[keyof typeof PropertyType];
  status?: (typeof PropertyStatus)[keyof typeof PropertyStatus];
  address: string;
  cadastralKey?: string;
  notes?: string;
  owner: EntityCode;
  manager: EntityCode;
  units: UnitDef[];
}

// ============================================================================
// HELPERS
// ============================================================================

function utcDate(year: number, monthIdx: number, day: number): Date {
  return new Date(Date.UTC(year, monthIdx, day));
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("🌱 Iniciando seed de Strata Systems MX — Plazas Magnum\n");

  // -- 1. Idempotencia: borrar tenant si ya existe --------------------------
  interface SavedPhoto {
    url: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    type: DocumentType;
  }
  const savedPropertyPhotos = new Map<string, SavedPhoto[]>();
  const savedUnitPhotos = new Map<string, SavedPhoto[]>();

  const existing = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
  });
  if (existing) {
    // Preservar fotos antes de borrar — se reinsertan después con los nuevos IDs
    const propPhotos = await prisma.document.findMany({
      where: {
        tenantId: existing.id,
        type: DocumentType.PROPERTY_PHOTO,
        propertyId: { not: null },
      },
      select: {
        url: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        type: true,
        property: { select: { name: true } },
      },
    });
    for (const doc of propPhotos) {
      if (!doc.property) continue;
      const key = doc.property.name;
      if (!savedPropertyPhotos.has(key)) savedPropertyPhotos.set(key, []);
      savedPropertyPhotos
        .get(key)!
        .push({
          url: doc.url,
          filename: doc.filename,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          type: doc.type,
        });
    }

    const unitPhotoTypes = [
      DocumentType.UNIT_PHOTO,
      DocumentType.UNIT_PHOTO_INITIAL,
      DocumentType.UNIT_PHOTO_FINAL,
    ] as const;
    const unitPhotos = await prisma.document.findMany({
      where: { tenantId: existing.id, type: { in: [...unitPhotoTypes] }, unitId: { not: null } },
      select: {
        url: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        type: true,
        unit: { select: { code: true, property: { select: { name: true } } } },
      },
    });
    for (const doc of unitPhotos) {
      if (!doc.unit) continue;
      const key = `${doc.unit.code}|${doc.unit.property.name}`;
      if (!savedUnitPhotos.has(key)) savedUnitPhotos.set(key, []);
      savedUnitPhotos
        .get(key)!
        .push({
          url: doc.url,
          filename: doc.filename,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          type: doc.type,
        });
    }

    const totalSaved = savedPropertyPhotos.size + savedUnitPhotos.size;
    if (totalSaved > 0)
      console.log(
        `Preservando fotos de ${savedPropertyPhotos.size} inmuebles y ${savedUnitPhotos.size} unidades...`,
      );

    console.log(`Borrando tenant existente "${TENANT_SLUG}" (${existing.id})...`);
    await prisma.tenant.delete({ where: { id: existing.id } });
  }

  // -- 2. Roles globales (upsert) -------------------------------------------
  const rolesData = [
    {
      code: RoleCode.MASTER,
      name: "Master",
      description: "Acceso total. Autoriza decisiones críticas.",
    },
    {
      code: RoleCode.ADMIN,
      name: "Administrador",
      description: "Operación completa con permisos granulares.",
    },
    {
      code: RoleCode.ACCOUNTANT,
      name: "Contador",
      description: "Solo lectura financiera, exporta para despacho contable.",
    },
    {
      code: RoleCode.OWNER,
      name: "Dueño",
      description: "Solo consulta (read-only) de vistas operativas.",
    },
    {
      code: RoleCode.PROMOTER,
      name: "Promotor",
      description: "Externo, ve solo inmuebles asignados.",
    },
    {
      code: RoleCode.LESSEE,
      name: "Inquilino",
      description: "Inquilino, ve su estado de cuenta.",
    },
  ];
  for (const r of rolesData) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
  }

  // -- 2b. Permisos globales + asignación por rol ---------------------------
  // Sin esto, solo MASTER pasa hasPermission (MASTER hace bypass por definición)
  // y cualquier ADMIN/ACCOUNTANT/OWNER falla toda acción protegida. El catálogo
  // vive en prisma/permissions-data.ts (compartido con sync-permissions.ts,
  // que lo aplica a una base existente sin re-correr este seed).
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: p,
    });
  }

  // MASTER hace bypass en hasPermission, así que no necesita filas.
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_CODES)) {
    const role = await prisma.role.findUnique({
      where: { code: roleCode as RoleCode },
    });
    if (!role) continue;
    for (const permCode of permCodes) {
      const perm = await prisma.permission.findUnique({
        where: { code: permCode },
      });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  // -- 3. Tenant ------------------------------------------------------------
  const tenant = await prisma.tenant.create({
    data: {
      slug: TENANT_SLUG,
      name: "Plazas Magnum",
      plan: Plan.STARTER,
      timezone: "America/Hermosillo",
      currency: "MXN",
    },
  });

  // -- 4. LegalEntities (CRT / TSR / QHS / JCL / CLICK) ---------------------
  const crt = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      code: "CRT",
      legalName: "CRT Desarrollo y Proyectos S.A. de C.V.",
      isOperator: true,
    },
  });
  const tsr = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      code: "TSR",
      legalName: "TSR Inmobiliaria S.A. de C.V.",
      isOperator: true,
    },
  });
  const qhs = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      code: "QHS",
      legalName: "QHS S.A. de C.V.",
      isOperator: false,
    },
  });
  // JCL = Juan Carlos L (persona física). Razón social registrada por
  // completitud; sus propiedades personales no se administran en Rex.
  const jcl = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      code: "JCL",
      legalName: "Juan Carlos L",
      isOperator: false,
    },
  });
  // CLICK: razón social satélite usada en el bloque de nóminas del Excel.
  // Factura servicios administrativos (OSC) y paga "Nómina Vinculación".
  const click = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      code: "CLICK",
      legalName: "Click S.A. de C.V.",
      isOperator: true,
    },
  });
  const entities: Record<EntityCode, { id: string }> = {
    CRT: crt,
    TSR: tsr,
    QHS: qhs,
    JCL: jcl,
    CLICK: click,
  };

  // -- 5. ExpenseCategories -------------------------------------------------
  const categoriesData: Array<{
    code: string;
    name: string;
    type: (typeof ExpenseType)[keyof typeof ExpenseType];
    isRecurring: boolean;
  }> = [
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
  for (const c of categoriesData) {
    await prisma.expenseCategory.create({ data: { ...c, tenantId: tenant.id } });
  }

  // -- 6. Properties + Units + Lessees + Contracts + Rents ------------------
  const propsDef: PropertyDef[] = [
    // 1. Plaza Progreso
    {
      name: "Plaza Magnum Progreso",
      type: PropertyType.PLAZA_COMERCIAL,
      address: "Blvd Progreso M-1A Fracc II L-29 Y 30, Fracc. Alto Valle, Hermosillo",
      cadastralKey: "15924002",
      owner: "CRT",
      manager: "CRT",
      units: [
        {
          code: "L1",
          name: "Goyoma",
          monthlyAmount: 17176.94,
          lessee: {
            legalName: "Goyoma S.A. de C.V.",
            contactName: "Juan Pablo Martinez",
            rfc: "GOY0401213V7",
            email: "arrendamientogoyoma@hotmail.com",
          },
          payments: PAID_Q1,
        },
        {
          code: "L2",
          vacant: true,
          unitNotes: "Local desocupado, en proceso de búsqueda de inquilino.",
        },
        {
          code: "L3",
          name: "Comex",
          monthlyAmount: 10050.14,
          lessee: {
            legalName: "Servicios de Informática y Variables Empresas Integradora S.A. de C.V.",
            rfc: "SIV960830D65",
            email: "facturashermosillo@camposreyes.com",
            phone: "2504367",
          },
          payments: PAID_Q1,
        },
        {
          code: "L4",
          name: "Tintorería",
          monthlyAmount: 9617.78,
          lessee: {
            legalName: "Maria Hortencia Galaz Ruiz",
            rfc: "RUDH431217GS9",
            email: "facturastintoreria@gmail.com",
            phone: "2120268",
          },
          payments: PAID_Q1,
        },
        {
          code: "L5",
          name: "Automoney",
          monthlyAmount: 10771.79,
          lessee: {
            legalName: "Centro Cambiario Smart Exchange S.A. de C.V.",
            contactName: "Guadalupe Noriega",
            rfc: "CCS1907031B3",
            email: "recursos.humanos@automoney.com.mx",
            phone: "6621244697",
          },
          payments: PAID_Q1,
        },
        {
          code: "L6",
          name: "Nikte",
          monthlyAmount: 9320.65,
          lessee: {
            legalName: "Jorge Alberto Islas Alonso",
            rfc: "IAAJ781101TI0",
            email: "jorgeislas85@hotmail.com",
            phone: "5528978128",
          },
          payments: PAID_Q1,
        },
        {
          code: "L7",
          name: "Master Cash",
          monthlyAmount: 8976.64,
          lessee: {
            legalName: "Master Cash",
            contactName: "Juan Flores",
            rfc: "MAS140312AU0",
            email: "mastercashfacturas@hotmail.com",
            phone: "6861198937",
          },
          payments: PAID_Q1,
        },
        {
          code: "L8",
          name: "Bluecell",
          monthlyAmount: 13600.0,
          lessee: {
            legalName: "Jose Gustavo Bojorquez Garcia",
            email: "jpcanez90@gmail.com",
          },
          paidInAdvance: true,
          advancePaidUntil: utcDate(YEAR, 6, 31), // 2026-07-31
          paidThroughMonth: 6, // Ene..Jul PAID
          contractNotes: "Cliente pagó 6 meses adelantados; renueva contrato en agosto 2026.",
        },
        {
          code: "L9",
          name: "Sushi",
          monthlyAmount: 11188.25,
          lessee: {
            legalName: "Rodrigo Huerta",
            contactName: "José Ramón Huerta",
            rfc: "HUCJ690702FD4",
            email: "Ro19980703@gmail.com",
            phone: "6621637244",
          },
          payments: {
            0: { kind: "paid" },
            1: { kind: "partial", amount: 6445 },
            2: { kind: "paid" },
          },
        },
        {
          code: "E",
          name: "ID Gráficos (espectacular)",
          monthlyAmount: 2320.0,
          lessee: {
            legalName: "ID Gráficos Creativos",
            contactName: "Diana Impsel",
            email: "buzonid@gmail.com",
            phone: "6621508269",
          },
          payments: {
            0: { kind: "paid" },
            1: { kind: "paid" },
            2: { kind: "unpaid" },
          },
        },
      ],
    },

    // 2. Plaza Olivares
    {
      name: "Plaza Magnum Olivares",
      type: PropertyType.PLAZA_COMERCIAL,
      address: "Castellana y D Olivares, Las Granjas, Hermosillo",
      cadastralKey: "05436042",
      owner: "CRT",
      manager: "CRT",
      units: [
        {
          code: "LP",
          name: "Benavides",
          monthlyAmount: 38649.85,
          lessee: {
            legalName: "Farmacias Benavides S.A.B de C.V.",
            rfc: "FBE9110215Z3",
            email: "esoto@benavides.com.mx",
          },
          payments: PAID_Q1,
        },
        {
          code: "L1",
          name: "Panadería",
          monthlyAmount: 10644.02,
          lessee: {
            legalName: "Ana Laura Cordova Mora",
            email: "panycoyotas@gmail.com",
            phone: "6621142744",
          },
          payments: PAID_Q1,
        },
        {
          code: "L2",
          name: "Telcel",
          monthlyAmount: 8600.82,
          lessee: {
            legalName: "Oscar Hugo Lopez Alvarado",
            rfc: "LOAO7507146I2",
            email: "oscarhugolopez1975@gmail.com",
            phone: "6621825035",
            notes: "Cliente con historial de pagos atrasados.",
          },
          payments: {
            0: { kind: "unpaid" },
            1: { kind: "paid" },
            2: { kind: "paid" },
          },
        },
        {
          code: "L3",
          name: "Interior",
          // Interio ocupa L3 + L4; se factura combinado (ver hoja RENTA MENSUAL).
          monthlyAmount: 20802.71,
          lessee: {
            legalName: "Domingo Emilio Gomez Moreno",
            rfc: "PECD8104056DA",
            email: "facturas@anguloperfecto.mx",
            phone: "6628480249",
          },
          payments: PAID_Q1,
        },
        {
          code: "L4",
          name: "Interior 2",
          vacant: true,
          unitNotes: "Ocupado por Interio junto con L3 (facturación combinada en L3).",
        },
      ],
    },

    // 3. Plaza Quiroga 1 (owner QHS, manager CRT — mismo esquema que Quiroga 2)
    {
      name: "Plaza Magnum Quiroga 1",
      type: PropertyType.PLAZA_COMERCIAL,
      address: "Perimetral Nte y Blvd Quiroga, Hermosillo",
      owner: "QHS",
      manager: "CRT",
      units: [
        {
          code: "LP",
          name: "7-Eleven",
          monthlyAmount: 45197.09,
          lessee: {
            legalName: "7-Eleven México S.A. de C.V.",
            contactName: "Francelia Saldaña",
            rfc: "SEM980701STA",
            email: "francelia.saldana@7-eleven.com.mx",
            phone: "8181580711",
          },
          payments: PAID_Q1,
        },
        {
          code: "L.A",
          name: "Quesos Calza",
          monthlyAmount: 11512.34,
          lessee: {
            legalName: "Quesos Calza",
            rfc: "QCA1508104W4",
            email: "facturascalza@hotmail.com",
          },
          payments: PAID_Q1,
        },
        {
          code: "L.B",
          name: "GI Similares",
          monthlyAmount: 11536.0,
          lessee: {
            legalName: "Carlos Alberto Bernal Marquez",
            rfc: "BEMC8405194H8",
            email: "carlosbernal.1905@gmail.com",
            phone: "6621693030",
          },
          payments: PAID_Q1,
        },
      ],
    },

    // 4. Plaza Quiroga 2 (owner QHS, manager CRT)
    {
      name: "Plaza Magnum Quiroga 2",
      type: PropertyType.PLAZA_COMERCIAL,
      address: "Perimetral Nte y Blvd Quiroga (etapa 2), Hermosillo",
      cadastralKey: "51007086",
      owner: "QHS",
      manager: "CRT",
      units: [
        {
          code: "L1",
          name: "Sucree",
          monthlyAmount: 13484.39,
          lessee: {
            legalName: "Suqiee Repostería Fina S.A. de C.V.",
            contactName: "Vinicio Velázquez",
            rfc: "SRF080527U49",
            email: "viniciovelazquez@suqiee.com.mx",
            phone: "6623020930",
          },
          payments: PAID_Q1,
        },
        {
          code: "L2",
          name: "Dentista",
          monthlyAmount: 12210.72,
          lessee: {
            legalName: "Dayana Duron Rivas",
            rfc: "DURD8507255MA",
            email: "dayaduron@hotmail.com",
            phone: "5527376942",
          },
          payments: PAID_Q1,
        },
        {
          code: "L3",
          name: "Semilla Hermosillo",
          monthlyAmount: 12586.0,
          lessee: {
            legalName: "Semilla Hermosillo",
            contactName: "José Payán",
          },
          contractNotes: "Local desocupado Ene–Feb 2026; contrato firmado en marzo.",
          contractStartDate: utcDate(YEAR, 2, 1), // 2026-03-01
          contractEndDate: utcDate(YEAR, 5, 30), // 2026-06-30
          rentStartMonth: 2, // desde marzo
          rentEndMonth: 5, // hasta junio
          payments: { 2: { kind: "paid" } },
        },
        {
          code: "L4",
          name: "Maki Sushi",
          monthlyAmount: 13020.83,
          lessee: {
            legalName: "Jesus Velazquez Garcia",
            email: "Giarbu08@gmail.com",
            phone: "6621157091",
          },
          payments: PAID_Q1,
        },
        {
          code: "L5",
          name: "Frituras Kikin",
          monthlyAmount: 14449.46,
          lessee: {
            legalName: "Flor Maria Serna Montoya",
            email: "Castrosernaf@gmail.com",
          },
          payments: PAID_Q1,
        },
        {
          code: "L6",
          name: "Puro Pa' Delante",
          monthlyAmount: 13500.0,
          lessee: { legalName: "Carlos Garibay" },
          payments: PAID_Q1,
        },
        {
          code: "L7",
          name: "Hitness",
          monthlyAmount: 13496.16,
          lessee: {
            legalName: "Maria del Carmen Choix",
            email: "maricarmen_19choix@hotmail.com",
            notes: "Cliente con historial de pagos atrasados.",
          },
          payments: {
            0: { kind: "paid" },
            1: { kind: "unpaid" },
            2: { kind: "paid" },
          },
        },
        {
          code: "L8",
          name: "Armando Elotes",
          monthlyAmount: 14306.28,
          lessee: {
            legalName: "Luis Armando Chavez",
            contactName: "Armando Morales",
          },
          payments: PAID_Q1,
        },
        {
          code: "E",
          name: "Medios Rubí (espectacular)",
          monthlyAmount: 2320.0,
          lessee: {
            legalName: "Medios Ruvi",
            email: "buzonmruvi@gmail.com",
          },
          payments: PAID_Q1,
        },
      ],
    },

    // 5. Inbursa Blvd Kino
    {
      name: "Inbursa Blvd Kino",
      type: PropertyType.TERRENO_RENTADO,
      address: "Blvd Francisco Eusebio Kino L1 Y 2 M22, Pitic, Hermosillo",
      cadastralKey: "03111002",
      owner: "TSR",
      manager: "TSR",
      units: [
        {
          code: "LP",
          name: "Banco Inbursa",
          monthlyAmount: 86028.56,
          lessee: {
            legalName: "Banco Inbursa S.A. Institución de Banca Múltiple",
            contactName: "Patricia Wong",
            rfc: "BII931004P61",
            email: "pwongo@inbursa.com",
            phone: "2890360",
          },
          payments: PAID_Q1,
        },
      ],
    },

    // 6. La Chila Garmendia
    {
      name: "La Chila Garmendia",
      type: PropertyType.EDIFICIO,
      address: "Nuevo León y Garmendia 58, Centro, Hermosillo",
      cadastralKey: "01119010",
      owner: "TSR",
      manager: "TSR",
      units: [
        {
          code: "OF",
          name: "La Chila",
          monthlyAmount: 30740.0,
          lessee: {
            legalName: "Representaciones Bazuca",
            contactName: "Rogelio Villaescusa",
            rfc: "RBA130326AC0",
            email: "rovilbe@outlook.com",
            phone: "6622761757",
          },
          payments: {
            0: { kind: "paid" },
            1: { kind: "partial", amount: 23000 },
            2: { kind: "paid" },
          },
        },
      ],
    },

    // 7. Capilla del Carmen
    {
      name: "Capilla del Carmen",
      type: PropertyType.OFICINA,
      address: "Capilla del Carmen, Hermosillo",
      cadastralKey: "01179002",
      owner: "TSR",
      manager: "TSR",
      units: [
        {
          code: "LP",
          name: "Proyecta",
          monthlyAmount: 19350.12,
          lessee: {
            legalName: "Proyecta",
            contactName: "Roque Ibarra",
            phone: "6628477858",
          },
          payments: PAID_Q1,
        },
      ],
    },

    // 8. Oficina Elias Piso 2 — empezó a rentarse en marzo 2026
    {
      name: "Oficina Elias Piso 2",
      type: PropertyType.OFICINA,
      address: "Edificio Elias, piso 2, Hermosillo",
      owner: "TSR",
      manager: "TSR",
      units: [
        {
          code: "OF",
          name: "Oficina Piso 2",
          monthlyAmount: 12500.0,
          lessee: {
            legalName: "Público General (Abogados)",
            contactName: "Roque Ibarra",
            phone: "6628477858",
          },
          contractNotes: "Local desocupado Ene–Feb 2026; rentado desde marzo.",
          contractStartDate: utcDate(YEAR, 2, 1), // 2026-03-01
          rentStartMonth: 2,
          payments: { 2: { kind: "paid" } },
        },
      ],
    },

    // 9. Nayarit 52 / Ferretería
    {
      name: "Nayarit 52 / Ferretería",
      type: PropertyType.OFICINA,
      address: "Calle Nayarit 52, Hermosillo",
      notes: "Propiedad de un familiar de Juan Carlos. CRT solo administra.",
      owner: "TSR",
      manager: "TSR",
      units: [
        {
          code: "OF",
          name: "Ferretería",
          monthlyAmount: 18560.0,
          lessee: {
            legalName: "Jorge Eduardo Franco",
            contactName: "Roque Ibarra",
            phone: "6628477858",
          },
          payments: PAID_Q1,
        },
      ],
    },

    // 10. Maria Escriba — propiedad CRT cuyo predial paga JC.
    {
      name: "Maria Escriba",
      type: PropertyType.OTRO,
      address: "Maria Escriba, Hermosillo",
      cadastralKey: "30204003",
      notes: "Predial pagado por terceros (JC).",
      owner: "CRT",
      manager: "CRT",
      units: [],
    },

    // 11. Serdán — dueña real Cecilia, predial lo paga CRT.
    {
      name: "Serdán",
      type: PropertyType.OTRO,
      address: "Serdán, Hermosillo",
      cadastralKey: "01173002",
      notes: "Dueña real: Cecilia. CRT realiza el pago de predial.",
      owner: "CRT",
      manager: "CRT",
      units: [],
    },

    // 12. La Jolla — casa personal del dueño Juan Carlos L (JCL); CRT administra.
    // Bloqueada: no se renta. En la UI no muestra renta, inquilino ni badge "Disponible".
    {
      name: "La Jolla",
      type: PropertyType.CASA,
      status: PropertyStatus.BLOQUEADO,
      address: "La Jolla, Hermosillo",
      notes: "Casa personal de Juan Carlos L. No se renta.",
      owner: "JCL",
      manager: "CRT",
      units: [
        {
          code: "U1",
          name: "Casa La Jolla",
          vacant: true,
          unitNotes: "Casa del dueño. No se renta.",
        },
      ],
    },
  ];

  for (const p of propsDef) {
    const property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        ownerEntityId: entities[p.owner].id,
        managerEntityId: entities[p.manager].id,
        name: p.name,
        type: p.type,
        status: p.status ?? PropertyStatus.EN_RENTA,
        address: p.address,
        cadastralKey: p.cadastralKey,
        notes: p.notes,
      },
    });

    for (const photo of savedPropertyPhotos.get(p.name) ?? []) {
      await prisma.document.create({
        data: {
          tenantId: tenant.id,
          type: photo.type,
          filename: photo.filename,
          url: photo.url,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
          propertyId: property.id,
        },
      });
    }

    for (const u of p.units) {
      const unitStatus = u.vacant ? UnitStatus.DISPONIBLE : UnitStatus.RENTADA;
      const unit = await prisma.unit.create({
        data: {
          tenantId: tenant.id,
          propertyId: property.id,
          code: u.code,
          name: u.name,
          status: unitStatus,
          notes: u.unitNotes,
          estimatedRent: u.monthlyAmount !== undefined ? decimal(u.monthlyAmount) : null,
        },
      });

      for (const photo of savedUnitPhotos.get(`${u.code}|${p.name}`) ?? []) {
        await prisma.document.create({
          data: {
            tenantId: tenant.id,
            type: photo.type,
            filename: photo.filename,
            url: photo.url,
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            unitId: unit.id,
          },
        });
      }

      if (u.vacant || !u.lessee || u.monthlyAmount === undefined) {
        continue;
      }

      const lessee = await prisma.lessee.create({
        data: {
          tenantId: tenant.id,
          legalName: u.lessee.legalName,
          contactName: u.lessee.contactName,
          rfc: u.lessee.rfc,
          email: u.lessee.email,
          phone: u.lessee.phone,
          notes: u.lessee.notes,
        },
      });

      const contractStart = u.contractStartDate ?? CONTRACT_START;
      const contractEnd = u.contractEndDate ?? CONTRACT_END;
      const monthlyAmt = u.monthlyAmount;

      const contract = await prisma.contract.create({
        data: {
          tenantId: tenant.id,
          unitId: unit.id,
          lesseeId: lessee.id,
          type: ContractType.ARRENDAMIENTO,
          status: ContractStatus.ACTIVE,
          startDate: contractStart,
          endDate: contractEnd,
          monthlyAmount: decimal(monthlyAmt),
          guaranteeAmount: decimal(monthlyAmt),
          paymentDay: 1,
          lateFeePercentage: decimal(5),
          paidInAdvance: u.paidInAdvance ?? false,
          advancePaidUntil: u.advancePaidUntil,
          signedDate: SIGNED,
          notes: u.contractNotes,
        },
      });

      // Depósito en garantía (1 mes)
      await prisma.guarantee.create({
        data: {
          tenantId: tenant.id,
          contractId: contract.id,
          amount: decimal(monthlyAmt),
          status: GuaranteeStatus.HELD,
          receivedDate: SIGNED,
        },
      });

      // Cargos mensuales (Rents) + pagos según el mapa `payments` del unit.
      //   · paidInAdvance (Bluecell)              → siempre PAID
      //   · payments[m] explícito                 → respeta kind (paid/partial/unpaid)
      //   · mes pasado sin entrada y sin advance  → UNPAID (días vencidos)
      //   · mes futuro sin entrada                → PENDING
      const startMonth = u.rentStartMonth ?? 0;
      const endMonth = u.rentEndMonth ?? 11;
      for (let m = startMonth; m <= endMonth; m++) {
        const period = utcDate(YEAR, m, 1);
        const dueDate = utcDate(YEAR, m, 1);
        const isAdvancePaid = u.paidThroughMonth !== undefined && m <= u.paidThroughMonth;
        const isPast = dueDate < TODAY;
        const explicit = u.payments?.[m];

        let rentStatus: (typeof RentStatus)[keyof typeof RentStatus];
        let amountPaid: Prisma.Decimal;
        let paymentToCreate: Prisma.Decimal | null = null;

        if (isAdvancePaid) {
          rentStatus = RentStatus.PAID;
          amountPaid = decimal(monthlyAmt);
          paymentToCreate = amountPaid;
        } else if (explicit?.kind === "paid") {
          const amt = explicit.amount ?? monthlyAmt;
          rentStatus = RentStatus.PAID;
          amountPaid = decimal(amt);
          paymentToCreate = amountPaid;
        } else if (explicit?.kind === "partial") {
          rentStatus = RentStatus.PARTIAL;
          amountPaid = decimal(explicit.amount);
          paymentToCreate = amountPaid;
        } else if (!isPast && explicit?.kind !== "unpaid") {
          rentStatus = RentStatus.PENDING;
          amountPaid = decimal(0);
        } else {
          const days = Math.floor((TODAY.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (days >= 90) rentStatus = RentStatus.OVERDUE_3M;
          else if (days >= 60) rentStatus = RentStatus.OVERDUE_2M;
          else if (days >= 30) rentStatus = RentStatus.OVERDUE_1M;
          else rentStatus = RentStatus.DUE;
          amountPaid = decimal(0);
        }

        const rent = await prisma.rent.create({
          data: {
            tenantId: tenant.id,
            contractId: contract.id,
            legalEntityId: entities[p.manager].id,
            period,
            dueDate,
            amountDue: decimal(monthlyAmt),
            amountPaid,
            status: rentStatus,
          },
        });

        if (paymentToCreate !== null) {
          await prisma.payment.create({
            data: {
              tenantId: tenant.id,
              rentId: rent.id,
              amount: paymentToCreate,
              paymentDate: dueDate,
              method: PaymentMethod.TRANSFER,
              reference: `TRF-${YEAR}-${String(m + 1).padStart(2, "0")}-${unit.code}`,
            },
          });
        }
      }
    }
  }

  // -- 6.5. Prediales 2026 -------------------------------------------------
  // Datos del Excel "PREDIALES 2026" del cliente.
  // dueDate por convención = 31-mar-YEAR (vencimiento Q1 con descuento por
  // pronto pago). paidMonth (0-indexado) = mes en que el cliente registró
  // el pago en su Excel; si null, predial pendiente sin monto confirmado.
  type PredialDef = {
    cadastralKey: string;
    totalAmount: number | null;
    paidMonth: number | null;
    payer?: EntityCode;
    paidByThirdPartyName?: string;
    notes?: string;
  };

  const predialesDef: PredialDef[] = [
    { cadastralKey: "05436042", totalAmount: 10517.0, paidMonth: 5 }, // Plaza Olivares — JUNIO
    { cadastralKey: "15924002", totalAmount: 17085.0, paidMonth: 4 }, // Plaza Progreso — MAYO
    { cadastralKey: "03111002", totalAmount: 13969.0, paidMonth: 3 }, // Inbursa/Kino — pagado, sin mes en Excel; asumimos abril.
    { cadastralKey: "01119010", totalAmount: 8977.0, paidMonth: 3 }, // La Chila/Garmendia — ABRIL
    { cadastralKey: "51007086", totalAmount: 24881.0, paidMonth: 3 }, // Plaza Quiroga — pagado, sin mes; asumimos abril.
    { cadastralKey: "01179002", totalAmount: 805.0, paidMonth: 3, payer: "TSR" }, // Capilla del Carmen (CLICK) — paga TSR
    {
      cadastralKey: "01173002",
      totalAmount: 5277.0,
      paidMonth: 3,
      payer: "CRT",
      notes: "Dueña real: Cecilia.",
    }, // Serdán — paga CRT
    { cadastralKey: "30204003", totalAmount: null, paidMonth: null, paidByThirdPartyName: "JC" }, // Maria Escriba — propiedad CRT, predial lo paga JC como tercero
  ];

  const dueDate2026 = utcDate(YEAR, 2, 31); // 31 de marzo del año fiscal
  for (const pd of predialesDef) {
    const property = await prisma.property.findFirst({
      where: { tenantId: tenant.id, cadastralKey: pd.cadastralKey },
      select: { id: true, name: true },
    });
    if (!property) {
      console.warn(`⚠️  Predial: no se encontró Property con clave ${pd.cadastralKey}, se omite.`);
      continue;
    }
    const paid = pd.paidMonth !== null;
    await prisma.cadastralPayment.create({
      data: {
        tenantId: tenant.id,
        propertyId: property.id,
        year: YEAR,
        totalAmount: pd.totalAmount !== null ? decimal(pd.totalAmount) : null,
        paidAmount: paid && pd.totalAmount !== null ? decimal(pd.totalAmount) : null,
        paymentDate: paid ? utcDate(YEAR, pd.paidMonth!, 15) : null,
        dueDate: dueDate2026,
        isPaid: paid,
        payerEntityId: pd.payer ? entities[pd.payer].id : null,
        paidByThirdPartyName: pd.paidByThirdPartyName ?? null,
        notes: pd.notes ?? null,
      },
    });
  }

  // -- 6.7. Egresos 2026 ---------------------------------------------------
  // Datos del Excel "PRESUPUESTO_INMOBILIARIAS_2026" del cliente.
  // Se genera un Expense por mes con monto > 0. Meses pasados (Ene-Abr) se
  // marcan como pagados; mayo en adelante quedan pendientes (presupuesto).
  type Months12 = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  type EgresoDef = {
    entity: EntityCode;
    category: string;
    description: string;
    amounts: Months12;
  };

  // Helper: idéntico a 12-array pero con valores constantes.
  const same = (n: number): Months12 => [n, n, n, n, n, n, n, n, n, n, n, n];

  const egresosDef: EgresoDef[] = [
    // ---------------- CRT ----------------
    {
      entity: "CRT",
      category: "NOMINA_DIRECCION",
      description: "Nómina dirección",
      amounts: [35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 52500],
    },
    {
      entity: "CRT",
      category: "NOMINA_GENERAL",
      description: "Nómina general",
      amounts: [
        61106.9, 36478.51, 47122.5, 39528, 46878, 39528, 39528, 35000, 39528, 35000, 46878, 59292,
      ],
    },
    {
      entity: "CRT",
      category: "PREDIAL",
      description: "Predial impuestos",
      amounts: [0, 0, 0, 9745, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      entity: "CRT",
      category: "PLACAS",
      description: "Placas, licencias y otros",
      amounts: [3498, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      entity: "CRT",
      category: "SAT",
      description: "SAT impuestos",
      amounts: [23305, 28907, 18879, 24000, 24000, 24000, 24000, 24000, 24000, 24000, 24000, 24000],
    },
    {
      entity: "CRT",
      category: "IMSS_INFONAVIT",
      description: "IMSS / Infonavit",
      amounts: [30622.81, 7073.99, 31846, 6500, 30500, 6500, 30500, 6500, 30500, 6500, 30500, 6500],
    },
    {
      entity: "CRT",
      category: "ISRTP",
      description: "ISR sobre Producto del Trabajo (3%)",
      amounts: [1670, 800, 1012, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200],
    },
    {
      entity: "CRT",
      category: "HONORARIOS",
      description: "Honorarios",
      amounts: [5552.16, 5270.34, 5252.94, 5316, 5316, 5316, 5316, 5316, 5316, 5316, 5316, 5316],
    },
    {
      entity: "CRT",
      category: "COMISIONES_BANCARIAS",
      description: "Comisiones bancarias",
      amounts: [388, 388, 395.56, 405, 405, 405, 405, 405, 405, 405, 405, 405],
    },
    {
      entity: "CRT",
      category: "MANTENIMIENTO_PLAZAS",
      description: "Mantenimiento plazas / limpieza / Casa JC",
      amounts: [
        47558.02, 25931.31, 7756.3, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000,
      ],
    },
    {
      entity: "CRT",
      category: "PAPELERIA",
      description: "Consumo oficina / papelería",
      amounts: [630, 1495, 2090, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
    },
    {
      entity: "CRT",
      category: "SERVICIOS_AUTOS",
      description: "Servicios, lavado y GPS Saveiro",
      amounts: [786, 8670.36, 0, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
    },
    {
      entity: "CRT",
      category: "FINANCIAMIENTO_TOYOTA",
      description: "Financiamiento Toyota (CRT)",
      amounts: same(6644.1),
    },
    {
      entity: "CRT",
      category: "FINANCIAMIENTO_EXPEDITION",
      description: "Financiamiento Expedition (CRT)",
      amounts: same(25711.92),
    },
    {
      entity: "CRT",
      category: "SEGUROS_INMUEBLES",
      description: "Seguros inmuebles / Saveiro",
      amounts: [7134.48, 0, 10345.29, 3939, 0, 0, 5345, 0, 6063, 4425, 0, 0],
    },
    {
      entity: "CRT",
      category: "ALARMA",
      description: "Alarma — Serdán / Bodega",
      amounts: same(960),
    },
    {
      entity: "CRT",
      category: "SANISO_BASURA",
      description: "Saniso — recolección basura",
      amounts: [
        5930.36, 6133.69, 6133.69, 5930.36, 5930.36, 5930.36, 5930.36, 5930.36, 5930.36, 5930.36,
        5930.36, 5930.36,
      ],
    },
    {
      entity: "CRT",
      category: "CFE",
      description: "CFE — Serdán / Progreso / Bodega / Quiroga",
      amounts: [5448, 0, 4375, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500],
    },
    {
      entity: "CRT",
      category: "AGUA",
      description: "Agua — Serdán / Bodega",
      amounts: [630, 3721, 5781, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000],
    },
    {
      entity: "CRT",
      category: "TELMEX",
      description: "Telmex — bar / oficinas",
      amounts: [2496, 4104, 2097, 2197, 2197, 2197, 2197, 2197, 2197, 2197, 2197, 2197],
    },
    {
      entity: "CRT",
      category: "TELCEL",
      description: "Telcel 2 líneas",
      amounts: [399, 399, 712, 399, 399, 399, 399, 399, 399, 399, 399, 399],
    },
    {
      entity: "CRT",
      category: "GASOLINA",
      description: "Gasolina Casa JC",
      amounts: [7900, 9889.46, 13500, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000],
    },
    {
      entity: "CRT",
      category: "OTROS",
      description: "Otros y comisiones",
      amounts: [12661, 12886.64, 14200, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000],
    },

    // ---------------- TSR ----------------
    {
      entity: "TSR",
      category: "NOMINA_DIRECCION",
      description: "Nómina dirección",
      amounts: [25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 37500],
    },
    {
      entity: "TSR",
      category: "NOMINA_GENERAL",
      description: "Nómina general",
      amounts: [15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 25000],
    },
    {
      entity: "TSR",
      category: "PREDIAL",
      description: "Predial impuestos",
      amounts: [0, 14785, 0, 8221, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      entity: "TSR",
      category: "PLACAS",
      description: "Placas, licencias y otros",
      amounts: [3498, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      entity: "TSR",
      category: "SAT",
      description: "SAT impuestos",
      amounts: [3142, 0, 14293, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200],
    },
    {
      entity: "TSR",
      category: "HONORARIOS",
      description: "Honorarios",
      amounts: [
        3173.67, 3167.67, 3179.27, 3138.67, 3138.67, 3138.67, 3138.67, 3138.67, 3138.67, 3138.67,
        3138.67, 3138.67,
      ],
    },
    {
      entity: "TSR",
      category: "COMISIONES_BANCARIAS",
      description: "Comisiones bancarias",
      amounts: [347.7, 333.5, 343.36, 370, 370, 370, 370, 370, 370, 370, 370, 370],
    },
    {
      entity: "TSR",
      category: "MANTENIMIENTO_PLAZAS",
      description: "Mantenimiento y otros",
      amounts: [0, 1911.54, 10588, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
    },
    {
      entity: "TSR",
      category: "PAPELERIA",
      description: "Papelería oficina (impresiones)",
      amounts: [0, 0, 0, 1615, 0, 0, 0, 0, 1196, 0, 0, 1197],
    },
    {
      entity: "TSR",
      category: "PAPELERIA",
      description: "Consumo oficina (bebidas, botanas, limpieza)",
      amounts: [2778, 1909, 1468, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000],
    },
    {
      entity: "TSR",
      category: "OTROS",
      description: "Lic, alcohol, permisos y comisiones",
      amounts: [0, 0, 0, 62125, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      entity: "TSR",
      category: "SEGUROS_INMUEBLES",
      description: "Seguro automotriz",
      amounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8553.72],
    },
    {
      entity: "TSR",
      category: "SERVICIOS_AUTOS",
      description: "Servicios y otros (autos)",
      amounts: [0, 0, 4073, 500, 500, 500, 500, 500, 500, 500, 500, 500],
    },
    {
      entity: "TSR",
      category: "FINANCIAMIENTO_BMW",
      description: "Financiamiento BMW (TSR)",
      amounts: [
        23752.01, 23752.01, 23156.98, 23752.01, 23752.01, 23752.01, 23752.01, 23752.01, 23752.01,
        23752.01, 23752.01, 23752.01,
      ],
    },
    {
      entity: "TSR",
      category: "GASOLINA",
      description: "Gasolina",
      amounts: [4914.84, 5000, 5300, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000],
    },
    {
      entity: "TSR",
      category: "OTROS",
      description: "Caja chica",
      amounts: [2000, 1600, 1600, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
    },
    {
      entity: "TSR",
      category: "OTROS",
      description: "Otros y comisiones",
      amounts: [55900, 20900, 22014, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000],
    },

    // ---------------- QHS ----------------
    {
      entity: "QHS",
      category: "HONORARIOS",
      description: "Contabilidad (honorarios)",
      amounts: same(1300),
    },
    {
      entity: "QHS",
      category: "COMISIONES_BANCARIAS",
      description: "Comisiones bancarias",
      amounts: same(655.4),
    },
  ];

  // Cargar el id de cada categoría una sola vez.
  const expenseCategoriesByCode = new Map<string, string>();
  const allCats = await prisma.expenseCategory.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, code: true },
  });
  for (const c of allCats) expenseCategoriesByCode.set(c.code, c.id);

  // Mes actual en YEAR — meses anteriores se consideran ya pagados.
  const currentMonth = TODAY.getUTCFullYear() > YEAR ? 12 : TODAY.getUTCMonth();

  let expensesCreated = 0;
  for (const def of egresosDef) {
    const categoryId = expenseCategoriesByCode.get(def.category);
    if (!categoryId) {
      console.warn(
        `⚠️  Egreso: categoría ${def.category} no existe, se omite "${def.description}".`,
      );
      continue;
    }
    const legalEntityId = entities[def.entity].id;
    for (let m = 0; m < 12; m++) {
      const amount = def.amounts[m];
      if (!amount || amount <= 0) continue;
      const isPaid = m < currentMonth;
      await prisma.expense.create({
        data: {
          tenantId: tenant.id,
          legalEntityId,
          categoryId,
          amount: decimal(amount),
          expenseDate: utcDate(YEAR, m, 15),
          description: def.description,
          paymentMethod: isPaid ? PaymentMethod.TRANSFER : null,
          isPaid,
        },
      });
      expensesCreated++;
    }
  }
  console.log(`Egresos ${YEAR} creados: ${expensesCreated}`);

  // -- 6.8. Nóminas 2026 ---------------------------------------------------
  // Datos del bloque "Estrategia Nómina" del Excel del cliente. Cubre
  // Ene–Jun 2026: facturas de servicios administrativos (Audazon/OSC),
  // nómina directa por razón social y nómina estratégica fiscal.
  type PayrollDef = {
    entity: EntityCode;
    type: "ADMIN_SERVICE_INVOICE" | "DIRECT_PAYROLL" | "STRATEGY_NOMINA";
    description: string;
    amount: number;
    amountWithoutTax?: number;
    taxAmount?: number;
  };

  const PAYROLL_MONTHS = [1, 2, 3, 4, 5, 6] as const; // Ene–Jun 2026
  const payrollDef: PayrollDef[] = [
    // ---------------- CRT (Audazon) ----------------
    {
      entity: "CRT",
      type: "ADMIN_SERVICE_INVOICE",
      description: "Factura Serv. Adm. (Audazon)",
      amount: 50627.04,
      amountWithoutTax: 43644.0,
      taxAmount: 6983.04,
    },
    {
      entity: "CRT",
      type: "DIRECT_PAYROLL",
      description: "Nómina Dirección",
      amount: 40000.0,
    },
    {
      entity: "CRT",
      type: "STRATEGY_NOMINA",
      description: "Impuestos y comisión estrategia nómina",
      amount: 3644.0,
    },

    // ---------------- TSR (OSC) ----------------
    {
      entity: "TSR",
      type: "ADMIN_SERVICE_INVOICE",
      description: "Factura Serv. Adm. (OSC)",
      amount: 44298.66,
      amountWithoutTax: 38188.5,
      taxAmount: 6110.16,
    },
    {
      entity: "TSR",
      type: "DIRECT_PAYROLL",
      description: "Nómina Dirección",
      amount: 20000.0,
    },
    {
      entity: "TSR",
      type: "DIRECT_PAYROLL",
      description: "Nómina Gerencia",
      amount: 15000.0,
    },
    {
      entity: "TSR",
      type: "STRATEGY_NOMINA",
      description: "Impuestos y comisión estrategia nómina",
      amount: 3188.5,
    },

    // ---------------- CLICK (OSC + vinculación) ----------------
    {
      entity: "CLICK",
      type: "ADMIN_SERVICE_INVOICE",
      description: "Factura Serv. Adm. (OSC)",
      amount: 6328.38,
      amountWithoutTax: 5455.5,
      taxAmount: 872.88,
    },
    {
      entity: "CLICK",
      type: "DIRECT_PAYROLL",
      description: "Nómina Vinculación",
      amount: 5000.0,
    },
  ];

  let payrollsCreated = 0;
  for (const def of payrollDef) {
    const legalEntityId = entities[def.entity].id;
    for (const m of PAYROLL_MONTHS) {
      await prisma.payroll.create({
        data: {
          tenantId: tenant.id,
          legalEntityId,
          period: utcDate(YEAR, m - 1, 1),
          type: def.type,
          amount: decimal(def.amount),
          amountWithoutTax:
            def.amountWithoutTax !== undefined ? decimal(def.amountWithoutTax) : null,
          taxAmount: def.taxAmount !== undefined ? decimal(def.taxAmount) : null,
          description: def.description,
        },
      });
      payrollsCreated++;
    }
  }
  console.log(`Nóminas ${YEAR} creadas: ${payrollsCreated}`);

  // -- 6.9. Préstamos (Loans) -----------------------------------------------
  // Financiamientos vehiculares del Excel. Montos de pago mensual tomados
  // directamente de la columna de egresos. Saldos y fechas aproximados.
  type LoanDef = {
    entity: EntityCode;
    name: string;
    lender: string;
    type: LoanType;
    originalAmount: number;
    currentBalance: number;
    monthlyPayment: number;
    interestRate: number;
    startDate: Date;
    endDate: Date;
    paymentDay: number;
    status: LoanStatus;
    paidMonths?: number[];
    /** Montos distintos al mensual fijo para meses específicos (0-indexed) */
    monthAmounts?: Partial<Record<number, number>>;
  };

  const loansDef: LoanDef[] = [
    // --- Hipotecas (CRT + TSR) ---
    // Datos del Excel: "HIPOTECA (CRT & TSR)" — pago mensual $32,430.11 c/u;
    // meses mar (2) y jul (6) de TSR tienen cuota alternativa $31,182.80.
    {
      entity: "CRT",
      name: "Hipoteca CRT",
      lender: "Banco (hipoteca)",
      type: LoanType.MORTGAGE,
      originalAmount: 3_500_000,
      currentBalance: 2_100_000,
      monthlyPayment: 32_430.11,
      interestRate: 0.1,
      startDate: utcDate(2018, 0, 1),
      endDate: utcDate(2033, 0, 1),
      paymentDay: 1,
      status: LoanStatus.ACTIVE,
      paidMonths: [0, 1, 2, 3],
    },
    {
      entity: "TSR",
      name: "Hipoteca TSR",
      lender: "Banco (hipoteca)",
      type: LoanType.MORTGAGE,
      originalAmount: 3_500_000,
      currentBalance: 2_100_000,
      monthlyPayment: 32_430.11,
      interestRate: 0.1,
      startDate: utcDate(2018, 0, 1),
      endDate: utcDate(2033, 0, 1),
      paymentDay: 1,
      status: LoanStatus.ACTIVE,
      paidMonths: [0, 1, 2, 3],
      // Cuota alternativa en marzo y julio (datos del Excel)
      monthAmounts: { 2: 31_182.8, 6: 31_182.8 },
    },
    // --- Préstamo JC ---
    // "PRESTAMO JC (BANCOS Y PERSONAL)": $11,181.44/mes, Oct 2026 = último pago
    {
      entity: "CRT",
      name: "Préstamo JC (bancos y personal)",
      lender: "Juan Carlos L / Bancos",
      type: LoanType.PERSONAL,
      originalAmount: 500_000,
      currentBalance: 167_721, // 15 cuotas restantes × $11,181
      monthlyPayment: 11_181.44,
      interestRate: 0.08,
      startDate: utcDate(2025, 0, 1),
      endDate: utcDate(2026, 9, 1), // octubre 2026
      paymentDay: 1,
      status: LoanStatus.ACTIVE,
      paidMonths: [0, 1, 2, 3],
    },
  ];

  let loansCreated = 0;
  for (const def of loansDef) {
    const loan = await prisma.loan.create({
      data: {
        tenantId: tenant.id,
        legalEntityId: entities[def.entity].id,
        name: def.name,
        lender: def.lender,
        type: def.type,
        originalAmount: decimal(def.originalAmount),
        currentBalance: decimal(def.currentBalance),
        monthlyPayment: decimal(def.monthlyPayment),
        interestRate: new Prisma.Decimal(def.interestRate.toFixed(4)),
        startDate: def.startDate,
        endDate: def.endDate,
        paymentDay: def.paymentDay,
        status: def.status,
      },
    });

    const paidSet = new Set(def.paidMonths ?? []);
    // Generamos las 12 cuotas del año completo (futuras con isPaid=false)
    // para que la matriz anual pueda mostrar el calendario completo.
    for (let m = 0; m < 12; m++) {
      // Verificar que el préstamo esté vigente este mes
      const periodStart = utcDate(YEAR, m, 1);
      const periodEnd = utcDate(YEAR, m + 1, 1);
      if (def.startDate >= periodEnd) continue;
      if (def.endDate && def.endDate <= periodStart) continue;

      const isPaid = paidSet.has(m);
      const amount = def.monthAmounts?.[m] ?? def.monthlyPayment;
      await prisma.loanPayment.create({
        data: {
          tenantId: tenant.id,
          loanId: loan.id,
          period: utcDate(YEAR, m, 1),
          amount: decimal(amount),
          paymentDate: isPaid ? utcDate(YEAR, m, def.paymentDay) : null,
          isPaid,
        },
      });
    }
    loansCreated++;
  }
  console.log(`Préstamos creados: ${loansCreated}`);

  // -- 6.10. Proyectos de Inversión -----------------------------------------
  // "PAGOS QUIROGA ETAPA FINAL" — datos del Excel del cliente.
  // Construcción de la etapa final de Plaza Quiroga 2, ~$152k/semana.
  const quiroganProperty = await prisma.property.findFirst({
    where: { tenantId: tenant.id, name: { contains: "Quiroga 2" } },
    select: { id: true },
  });

  const invProject = await prisma.investmentProject.create({
    data: {
      tenantId: tenant.id,
      legalEntityId: entities["QHS"].id,
      propertyId: quiroganProperty?.id ?? null,
      name: "Etapa Final Plaza Quiroga 2",
      description:
        "Construcción de la etapa final de Plaza Magnum Quiroga 2. Pagos semanales de obra.",
      budgetAmount: decimal(1_621_586), // construcción $1,375,824 + estacionamiento $245,762
      executedAmount: decimal(1_375_824), // Est.1-9 pagados (todas las estimaciones de construcción)
      startDate: utcDate(2025, 9, 1),
      endDate: utcDate(YEAR, 6, 30),
      status: InvestmentProjectStatus.ACTIVE,
    },
  });

  // Pagos del Excel "PAGOS QUIROGA ETAPA FINAL":
  //   Etapa 2 (Sem 16-24): $150k, $155,762, $152,881, $150k, $149k,
  //                         $152,881, $152,900, $152,900, $159,500  = $1,375,824
  //   Estacionamiento (2 pagos): $122,881 + $122,881                 = $245,762
  //   Total contratado: $1,621,586
  // Los primeros 7 pagos (hasta ene/feb 2026) se marcan PAID; el resto PENDING.
  type InvPayDef = { description: string; date: Date; amount: number; isPaid: boolean };
  const invPaymentsDef: InvPayDef[] = [
    // Etapa 2 — semanas 16-24
    {
      description: "Est.1 Etapa 2 — estructura",
      date: utcDate(2025, 9, 10),
      amount: 150_000,
      isPaid: true,
    }, // Sem 16: 16-21 Oct
    {
      description: "Est.2 Etapa 2 — estructura",
      date: utcDate(2025, 9, 24),
      amount: 155_762,
      isPaid: true,
    }, // Sem 17: 23-28 Oct
    {
      description: "Est.3 Etapa 2 — muros",
      date: utcDate(2025, 9, 30),
      amount: 152_881,
      isPaid: true,
    }, // Sem 18: 30 Oct-4 Nov
    {
      description: "Est.4 Etapa 2 — muros",
      date: utcDate(2025, 10, 6),
      amount: 150_000,
      isPaid: true,
    }, // Sem 19: 6-11 Nov
    {
      description: "Est.5 Etapa 2 — instalaciones",
      date: utcDate(2025, 10, 13),
      amount: 149_000,
      isPaid: true,
    }, // Sem 20: 13-18 Nov
    {
      description: "Est.6 Etapa 2 — instalaciones",
      date: utcDate(2025, 10, 20),
      amount: 152_881,
      isPaid: true,
    }, // Sem 21: 20-25 Nov
    {
      description: "Est.7 Etapa 2 — acabados",
      date: utcDate(2025, 10, 27),
      amount: 152_900,
      isPaid: true,
    }, // Sem 22: 27 Nov-2 Dic
    {
      description: "Est.8 Etapa 2 — acabados",
      date: utcDate(2025, 11, 4),
      amount: 152_900,
      isPaid: true,
    }, // Sem 23: 4-9 Dic
    {
      description: "Est.9 Etapa 2 — ajustes finales",
      date: utcDate(2025, 11, 11),
      amount: 159_500,
      isPaid: true,
    }, // Sem 24: 11-16 Dic
    // Estacionamiento
    {
      description: "Estacionamiento — pago 1",
      date: utcDate(YEAR, 3, 11),
      amount: 122_881,
      isPaid: false,
    },
    {
      description: "Estacionamiento — pago 2",
      date: utcDate(YEAR, 5, 6),
      amount: 122_881,
      isPaid: false,
    },
  ];

  for (const pay of invPaymentsDef) {
    await prisma.investmentPayment.create({
      data: {
        tenantId: tenant.id,
        projectId: invProject.id,
        description: pay.description,
        amount: decimal(pay.amount),
        paymentDate: pay.date,
        isPaid: pay.isPaid,
      },
    });
  }
  console.log("Proyecto de inversión creado: Etapa Final Plaza Quiroga 2");

  // -- 6.12. Presupuesto 2026 -----------------------------------------------
  // Datos del Excel "PRESUPUESTO_INMOBILIARIAS_2026".
  // Un Budget por razón social (CRT, TSR, QHS) con líneas de ingreso, egreso,
  // estrategia fiscal y servicio de deuda para cada mes del año.

  type M12 = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const s12 = (n: number): M12 => [n, n, n, n, n, n, n, n, n, n, n, n];
  const jan6 = (n: number): M12 => [n, n, n, n, n, n, 0, 0, 0, 0, 0, 0];

  interface BudgetLineDef {
    type: BudgetConceptType;
    label: string;
    m: M12;
  }

  async function seedBudgetLines(budgetId: string, lines: BudgetLineDef[]) {
    for (const l of lines) {
      await prisma.budgetLine.create({
        data: {
          budgetId,
          conceptType: l.type,
          conceptLabel: l.label,
          jan: decimal(l.m[0]),
          feb: decimal(l.m[1]),
          mar: decimal(l.m[2]),
          apr: decimal(l.m[3]),
          may: decimal(l.m[4]),
          jun: decimal(l.m[5]),
          jul: decimal(l.m[6]),
          aug: decimal(l.m[7]),
          sep: decimal(l.m[8]),
          oct: decimal(l.m[9]),
          nov: decimal(l.m[10]),
          dec: decimal(l.m[11]),
        },
      });
    }
  }

  const IR = BudgetConceptType.INCOME_RENT;
  const IB = BudgetConceptType.INCOME_BILLBOARD;
  const EX = BudgetConceptType.EXPENSE;
  const TS = BudgetConceptType.TAX_STRATEGY;
  const DS = BudgetConceptType.DEBT_SERVICE;

  // ── CRT ────────────────────────────────────────────────────────────────────
  // Ingresos: Progreso + Olivares + Quiroga 1 + Quiroga 2 (CRT administra).
  // Quiroga 2 base 93 058.10 / mes; mar–jun +Cristianos 12 586 = 105 644.10.
  // Espectaculares: Progreso E y Quiroga 2 E, 2 320 / mes cada uno.
  // Egresos, nómina estratégica y deuda: tomados del Excel 2026.
  const crtBudget = await prisma.budget.create({
    data: { tenantId: tenant.id, legalEntityId: crt.id, year: YEAR },
  });
  await seedBudgetLines(crtBudget.id, [
    // INGRESOS
    { type: IR, label: "Plaza Progreso", m: s12(89292.38) },
    { type: IR, label: "Plaza Olivares", m: s12(75022.84) },
    { type: IR, label: "Plaza Quiroga 1", m: s12(63672.59) },
    {
      type: IR,
      label: "Plaza Quiroga 2",
      m: [
        93058.1, 93058.1, 105644.1, 105644.1, 105644.1, 105644.1, 93058.1, 93058.1, 93058.1,
        93058.1, 93058.1, 93058.1,
      ],
    },
    { type: IB, label: "Espectacular Progreso", m: s12(2320) },
    { type: IB, label: "Espectacular Quiroga 2", m: s12(2320) },

    // EGRESOS
    {
      type: EX,
      label: "Nómina Dirección",
      m: [35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 52500],
    },
    {
      type: EX,
      label: "Nómina General",
      m: [
        61106.9, 36478.51, 47122.5, 39528, 46878, 39528, 39528, 35000, 39528, 35000, 46878, 59292,
      ],
    },
    {
      type: EX,
      label: "Honorarios",
      m: [5552.16, 5270.34, 5252.94, 5316, 5316, 5316, 5316, 5316, 5316, 5316, 5316, 5316],
    },
    {
      type: EX,
      label: "SAT",
      m: [23305, 28907, 18879, 24000, 24000, 24000, 24000, 24000, 24000, 24000, 24000, 24000],
    },
    {
      type: EX,
      label: "IMSS / Infonavit",
      m: [30622.81, 7073.99, 31846, 6500, 30500, 6500, 30500, 6500, 30500, 6500, 30500, 6500],
    },
    {
      type: EX,
      label: "ISR s/ Producto del Trabajo",
      m: [1670, 800, 1012, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200],
    },
    { type: EX, label: "Predial (CRT)", m: [0, 0, 0, 9745, 0, 0, 0, 0, 0, 0, 0, 0] },
    { type: EX, label: "Placas y licencias", m: [3498, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    {
      type: EX,
      label: "Comisiones bancarias",
      m: [388, 388, 395.56, 405, 405, 405, 405, 405, 405, 405, 405, 405],
    },
    {
      type: EX,
      label: "Mantenimiento y limpieza",
      m: [
        47558.02, 25931.31, 7756.3, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000,
      ],
    },
    {
      type: EX,
      label: "Papelería y consumo de oficina",
      m: [630, 1495, 2090, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
    },
    {
      type: EX,
      label: "Vehículos — servicios y lavado",
      m: [786, 8670.36, 0, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
    },
    { type: EX, label: "Financiamiento Toyota", m: s12(6644.1) },
    { type: EX, label: "Financiamiento Expedition", m: s12(25711.92) },
    {
      type: EX,
      label: "Seguros",
      m: [7134.48, 0, 10345.29, 3939, 0, 0, 5345, 0, 6063, 4425, 0, 0],
    },
    { type: EX, label: "Alarma — Serdán / Bodega", m: s12(960) },
    {
      type: EX,
      label: "Saniso — recolección de basura",
      m: [
        5930.36, 6133.69, 6133.69, 5930.36, 5930.36, 5930.36, 5930.36, 5930.36, 5930.36, 5930.36,
        5930.36, 5930.36,
      ],
    },
    {
      type: EX,
      label: "CFE",
      m: [5448, 0, 4375, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500],
    },
    {
      type: EX,
      label: "Agua",
      m: [630, 3721, 5781, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000],
    },
    {
      type: EX,
      label: "Telmex",
      m: [2496, 4104, 2097, 2197, 2197, 2197, 2197, 2197, 2197, 2197, 2197, 2197],
    },
    { type: EX, label: "Telcel", m: [399, 399, 712, 399, 399, 399, 399, 399, 399, 399, 399, 399] },
    {
      type: EX,
      label: "Gasolina",
      m: [7900, 9889.46, 13500, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000],
    },
    {
      type: EX,
      label: "Otros y comisiones",
      m: [12661, 12886.64, 14200, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000],
    },

    // ESTRATEGIA FISCAL — nómina Audazon (ene–jun)
    { type: TS, label: "Factura Serv. Adm. Audazon", m: jan6(50627.04) },
    { type: TS, label: "Nómina Dirección directa", m: jan6(40000) },
    { type: TS, label: "Impuestos y comisión estrategia", m: jan6(3644) },

    // SERVICIO DE DEUDA
    { type: DS, label: "Hipoteca CRT", m: s12(32430.11) },
    {
      type: DS,
      label: "Préstamo JC (bancos y personal)",
      m: [
        11181.44, 11181.44, 11181.44, 11181.44, 11181.44, 11181.44, 11181.44, 11181.44, 11181.44,
        11181.44, 0, 0,
      ],
    },
  ]);

  // ── TSR ────────────────────────────────────────────────────────────────────
  // Ingresos: Inbursa Kino, La Chila, Capilla del Carmen, Elias (desde mar),
  //           Nayarit 52.
  const tsrBudget = await prisma.budget.create({
    data: { tenantId: tenant.id, legalEntityId: tsr.id, year: YEAR },
  });
  await seedBudgetLines(tsrBudget.id, [
    // INGRESOS
    { type: IR, label: "Inbursa Blvd Kino", m: s12(86028.56) },
    { type: IR, label: "La Chila Garmendia", m: s12(30740) },
    { type: IR, label: "Capilla del Carmen", m: s12(19350.12) },
    {
      type: IR,
      label: "Oficina Elias Piso 2",
      m: [0, 0, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500],
    },
    { type: IR, label: "Nayarit 52 / Ferretería", m: s12(18560) },

    // EGRESOS
    {
      type: EX,
      label: "Nómina Dirección",
      m: [25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 37500],
    },
    {
      type: EX,
      label: "Nómina General",
      m: [15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 25000],
    },
    {
      type: EX,
      label: "Honorarios",
      m: [
        3173.67, 3167.67, 3179.27, 3138.67, 3138.67, 3138.67, 3138.67, 3138.67, 3138.67, 3138.67,
        3138.67, 3138.67,
      ],
    },
    {
      type: EX,
      label: "SAT",
      m: [3142, 0, 14293, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200],
    },
    { type: EX, label: "Predial (TSR)", m: [0, 14785, 0, 8221, 0, 0, 0, 0, 0, 0, 0, 0] },
    { type: EX, label: "Placas y licencias", m: [3498, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    {
      type: EX,
      label: "Comisiones bancarias",
      m: [347.7, 333.5, 343.36, 370, 370, 370, 370, 370, 370, 370, 370, 370],
    },
    {
      type: EX,
      label: "Mantenimiento y otros",
      m: [0, 1911.54, 10588, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
    },
    {
      type: EX,
      label: "Papelería y consumo de oficina",
      m: [2778, 1909, 1468, 3615, 2000, 2000, 2000, 2000, 3196, 2000, 2000, 3197],
    },
    { type: EX, label: "Seguro automotriz", m: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8553.72] },
    {
      type: EX,
      label: "Vehículos — servicios",
      m: [0, 0, 4073, 500, 500, 500, 500, 500, 500, 500, 500, 500],
    },
    {
      type: EX,
      label: "Financiamiento BMW",
      m: [
        23752.01, 23752.01, 23156.98, 23752.01, 23752.01, 23752.01, 23752.01, 23752.01, 23752.01,
        23752.01, 23752.01, 23752.01,
      ],
    },
    {
      type: EX,
      label: "Gasolina",
      m: [4914.84, 5000, 5300, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000],
    },
    {
      type: EX,
      label: "Otros, caja chica y comisiones",
      m: [57900, 22500, 23614, 68625, 6500, 6500, 6500, 6500, 6500, 6500, 6500, 6500],
    },

    // ESTRATEGIA FISCAL — nómina OSC (ene–jun)
    { type: TS, label: "Factura Serv. Adm. OSC", m: jan6(44298.66) },
    { type: TS, label: "Nómina Dirección directa", m: jan6(20000) },
    { type: TS, label: "Nómina Gerencia directa", m: jan6(15000) },
    { type: TS, label: "Impuestos y comisión estrategia", m: jan6(3188.5) },

    // SERVICIO DE DEUDA
    // Mar y Jul tienen cuota alternativa 31 182.80 (datos del Excel).
    {
      type: DS,
      label: "Hipoteca TSR",
      m: [
        32430.11, 32430.11, 31182.8, 32430.11, 32430.11, 32430.11, 31182.8, 32430.11, 32430.11,
        32430.11, 32430.11, 32430.11,
      ],
    },
  ]);

  // ── QHS ────────────────────────────────────────────────────────────────────
  // QHS solo registra sus costos administrativos.
  // Los ingresos de Quiroga 2 fluyen a CRT (que administra).
  const qhsBudget = await prisma.budget.create({
    data: { tenantId: tenant.id, legalEntityId: qhs.id, year: YEAR },
  });
  await seedBudgetLines(qhsBudget.id, [
    { type: EX, label: "Honorarios contabilidad", m: s12(1300) },
    { type: EX, label: "Comisiones bancarias", m: s12(655.4) },
  ]);

  console.log(
    `Presupuesto ${YEAR} creado: CRT (${crtBudget.id}), TSR (${tsrBudget.id}), QHS (${qhsBudget.id})`,
  );

  // -- 7. Usuario admin de prueba ------------------------------------------
  const masterRole = await prisma.role.findUnique({
    where: { code: RoleCode.MASTER },
  });
  if (!masterRole) {
    throw new Error("Role MASTER no encontrado tras el upsert. Algo salió mal.");
  }
  const devUsers = [
    { email: "crm.inmobiliaria02@gmail.com", name: "Admin Demo", phone: "+526621151171" },
    { email: "lr384492@gmail.com", name: "Leonardo Reyes", phone: null },
  ];
  for (const u of devUsers) {
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      select: { id: true },
    });
    if (existing) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: existing.id, roleId: masterRole.id } },
        update: {},
        create: { userId: existing.id, roleId: masterRole.id },
      });
    } else {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          clerkId: null,
          roles: { create: [{ roleId: masterRole.id }] },
        },
      });
    }
  }

  // -- 8. Resumen ----------------------------------------------------------
  const tenantWhere = { where: { tenantId: tenant.id } };
  const [
    tenantsCount,
    legalEntitiesCount,
    propertiesCount,
    unitsTotal,
    unitsRented,
    unitsAvailable,
    lesseesCount,
    contractsCount,
    rentsCount,
    rentsPaid,
    rentsPartial,
    rentsPending,
    rentsOverdue,
    paymentsCount,
    guaranteesCount,
    expenseCategoriesCount,
    expensesCount,
    expensesPaid,
    cadastralCount,
    cadastralPaid,
    payrollsCount,
    loansCount,
    investmentProjectsCount,
    usersCount,
  ] = await Promise.all([
    prisma.tenant.count({ where: { slug: TENANT_SLUG } }),
    prisma.legalEntity.count(tenantWhere),
    prisma.property.count(tenantWhere),
    prisma.unit.count(tenantWhere),
    prisma.unit.count({ where: { tenantId: tenant.id, status: UnitStatus.RENTADA } }),
    prisma.unit.count({ where: { tenantId: tenant.id, status: UnitStatus.DISPONIBLE } }),
    prisma.lessee.count(tenantWhere),
    prisma.contract.count(tenantWhere),
    prisma.rent.count(tenantWhere),
    prisma.rent.count({ where: { tenantId: tenant.id, status: RentStatus.PAID } }),
    prisma.rent.count({ where: { tenantId: tenant.id, status: RentStatus.PARTIAL } }),
    prisma.rent.count({ where: { tenantId: tenant.id, status: RentStatus.PENDING } }),
    prisma.rent.count({
      where: {
        tenantId: tenant.id,
        status: {
          in: [RentStatus.DUE, RentStatus.OVERDUE_1M, RentStatus.OVERDUE_2M, RentStatus.OVERDUE_3M],
        },
      },
    }),
    prisma.payment.count(tenantWhere),
    prisma.guarantee.count(tenantWhere),
    prisma.expenseCategory.count(tenantWhere),
    prisma.expense.count(tenantWhere),
    prisma.expense.count({ where: { tenantId: tenant.id, isPaid: true } }),
    prisma.cadastralPayment.count(tenantWhere),
    prisma.cadastralPayment.count({
      where: { tenantId: tenant.id, isPaid: true },
    }),
    prisma.payroll.count(tenantWhere),
    prisma.loan.count(tenantWhere),
    prisma.investmentProject.count(tenantWhere),
    prisma.user.count(tenantWhere),
  ]);

  console.log("\n========================================");
  console.log("✅ Seed completado: Plazas Magnum");
  console.log("========================================");
  console.log(`Tenants:                ${tenantsCount}`);
  console.log(`Razones sociales:       ${legalEntitiesCount}  (CRT, TSR, QHS, JCL, CLICK)`);
  console.log(`Inmuebles (Property):   ${propertiesCount}`);
  console.log(
    `Unidades:               ${unitsTotal}  (${unitsRented} rentadas, ${unitsAvailable} disponibles)`,
  );
  console.log(`Inquilinos (Lessee):    ${lesseesCount}`);
  console.log(`Contratos activos:      ${contractsCount}`);
  console.log(
    `Cargos (Rent):          ${rentsCount}  (${rentsPaid} pagados, ${rentsPartial} parciales, ${rentsOverdue} vencidos sin pago, ${rentsPending} a futuro)`,
  );
  console.log(`Pagos registrados:      ${paymentsCount}`);
  console.log(`Depósitos en garantía:  ${guaranteesCount}`);
  console.log(`Categorías de gasto:    ${expenseCategoriesCount}`);
  console.log(`Egresos ${YEAR}:             ${expensesCount}  (${expensesPaid} pagados)`);
  console.log(`Prediales ${YEAR}:           ${cadastralCount}  (${cadastralPaid} pagados)`);
  console.log(`Nóminas ${YEAR}:             ${payrollsCount}`);
  console.log(`Préstamos:              ${loansCount}`);
  console.log(`Proyectos inversión:    ${investmentProjectsCount}`);
  console.log(`Usuarios:               ${usersCount}`);
  console.log("========================================");
  console.log(`Login demo: crm.inmobiliaria02@gmail.com (rol MASTER)\n`);
  console.log("👉 Próximo paso para autenticarte:");
  console.log("   1. Crea una cuenta en Clerk con el email crm.inmobiliaria02@gmail.com");
  console.log("      (la primera vez que entres, requireAuth lo vinculará por email).");
  console.log(
    "   2. O bien corre `pnpm db:link-clerk` cuando lo implementemos para vincularlo manualmente.\n",
  );
}

main()
  .catch((error) => {
    console.error("❌ Seed falló:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
