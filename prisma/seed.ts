import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  ContractStatus,
  ContractType,
  ExpenseType,
  GuaranteeStatus,
  PaymentMethod,
  Plan,
  PropertyType,
  RentStatus,
  RoleCode,
  UnitStatus,
} from "../src/generated/prisma/enums";

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

type EntityCode = "CRT" | "TSR" | "QHS" | "JCL";

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
  const existing = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
  });
  if (existing) {
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

  // -- 4. LegalEntities (CRT / TSR / QHS / JCL) -----------------------------
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
  // JCL = Juan Carlos L (persona física, dueño de La Jolla y Bodega).
  // CRT administra operacionalmente; JCL aparece como owner formal.
  const jcl = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      code: "JCL",
      legalName: "Juan Carlos L",
      isOperator: false,
    },
  });
  const entities: Record<EntityCode, { id: string }> = {
    CRT: crt,
    TSR: tsr,
    QHS: qhs,
    JCL: jcl,
  };

  // -- 5. ExpenseCategories -------------------------------------------------
  const categoriesData: Array<{
    code: string;
    name: string;
    type: (typeof ExpenseType)[keyof typeof ExpenseType];
    isRecurring: boolean;
  }> = [
    // Nóminas
    { code: "NOMINA_DIRECCION", name: "Nómina Dirección", type: ExpenseType.PAYROLL, isRecurring: true },
    { code: "NOMINA_GENERAL", name: "Nómina General", type: ExpenseType.PAYROLL, isRecurring: true },
    { code: "HONORARIOS", name: "Honorarios", type: ExpenseType.PAYROLL, isRecurring: true },
    // Impuestos
    { code: "PREDIAL", name: "Predial", type: ExpenseType.TAX, isRecurring: true },
    { code: "SAT", name: "SAT", type: ExpenseType.TAX, isRecurring: true },
    { code: "IMSS_INFONAVIT", name: "IMSS / Infonavit", type: ExpenseType.TAX, isRecurring: true },
    { code: "ISRTP", name: "ISR sobre Producto del Trabajo", type: ExpenseType.TAX, isRecurring: true },
    { code: "PLACAS", name: "Placas vehiculares", type: ExpenseType.TAX, isRecurring: true },
    // Servicios
    { code: "CFE", name: "Comisión Federal de Electricidad", type: ExpenseType.UTILITY, isRecurring: true },
    { code: "AGUA", name: "Agua", type: ExpenseType.UTILITY, isRecurring: true },
    { code: "TELMEX", name: "Telmex", type: ExpenseType.UTILITY, isRecurring: true },
    { code: "TELCEL", name: "Telcel", type: ExpenseType.UTILITY, isRecurring: true },
    { code: "SANISO_BASURA", name: "Saniso / Recolección de basura", type: ExpenseType.UTILITY, isRecurring: true },
    { code: "ALARMA", name: "Alarma / monitoreo", type: ExpenseType.UTILITY, isRecurring: true },
    // Mantenimiento
    { code: "MANTENIMIENTO_PLAZAS", name: "Mantenimiento de plazas", type: ExpenseType.MAINTENANCE, isRecurring: false },
    { code: "LIMPIEZA", name: "Limpieza", type: ExpenseType.MAINTENANCE, isRecurring: true },
    // Vehículos
    { code: "FINANCIAMIENTO_TOYOTA", name: "Financiamiento Toyota", type: ExpenseType.VEHICLE, isRecurring: true },
    { code: "FINANCIAMIENTO_EXPEDITION", name: "Financiamiento Expedition", type: ExpenseType.VEHICLE, isRecurring: true },
    { code: "GASOLINA", name: "Gasolina", type: ExpenseType.VEHICLE, isRecurring: true },
    { code: "SERVICIOS_AUTOS", name: "Servicios de autos", type: ExpenseType.VEHICLE, isRecurring: false },
    // Otros
    { code: "SEGUROS_INMUEBLES", name: "Seguros de inmuebles", type: ExpenseType.INSURANCE, isRecurring: true },
    { code: "COMISIONES_BANCARIAS", name: "Comisiones bancarias", type: ExpenseType.BANK_FEE, isRecurring: true },
    { code: "PAPELERIA", name: "Papelería", type: ExpenseType.OFFICE, isRecurring: false },
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
        { code: "L1", name: "Goyoma", monthlyAmount: 16524.52, lessee: { legalName: "Goyoma", contactName: "Juan Pablo Martinez" }, payments: PAID_Q1 },
        { code: "L2", vacant: true, unitNotes: "Local desocupado, en proceso de búsqueda de inquilino." },
        { code: "L3", name: "Comex", monthlyAmount: 10050.14, lessee: { legalName: "Servicios de Informática y Variables" }, payments: PAID_Q1 },
        { code: "L4", name: "Tintorería", monthlyAmount: 9617.78, lessee: { legalName: "Tintorería", contactName: "Maria Hortencia Galaz Ruiz" }, payments: PAID_Q1 },
        { code: "L5", name: "Automoney", monthlyAmount: 10771.8, lessee: { legalName: "Automoney", contactName: "Luis Edmundo Reina Sanchez" }, payments: PAID_Q1 },
        { code: "L6", name: "Nikte", monthlyAmount: 9320.65, lessee: { legalName: "Nikte" }, payments: PAID_Q1 },
        { code: "L7", name: "Master Cash", monthlyAmount: 8976.64, lessee: { legalName: "Master Cash" }, payments: PAID_Q1 },
        {
          code: "L8",
          name: "Bluecell",
          monthlyAmount: 13500.0,
          lessee: { legalName: "Bluecell" },
          paidInAdvance: true,
          advancePaidUntil: utcDate(YEAR, 6, 31), // 2026-07-31
          paidThroughMonth: 6, // Ene..Jul PAID
          contractNotes: "Cliente pagó adelantado en enero ($81,600 cubre Ene–Jul).",
        },
        {
          code: "L9",
          name: "Sushi",
          monthlyAmount: 10530.85,
          lessee: { legalName: "Sushi" },
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
          lessee: { legalName: "ID Gráficos" },
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
        { code: "LP", name: "Benavides", monthlyAmount: 37156.17, lessee: { legalName: "Farmacias Benavides S.A.B de C.V." }, payments: PAID_Q1 },
        { code: "L1", name: "Panadería", monthlyAmount: 10015.42, lessee: { legalName: "Panadería", contactName: "Vintila Mora Avalos" }, payments: PAID_Q1 },
        {
          code: "L2",
          name: "Telcel",
          monthlyAmount: 8095.29,
          lessee: {
            legalName: "Telcel",
            contactName: "Oscar Hugo Lopez Alvarado",
            notes: "Cliente con historial de pagos atrasados.",
          },
          payments: {
            0: { kind: "unpaid" },
            1: { kind: "paid" },
            2: { kind: "paid" },
          },
        },
        { code: "L3", name: "Interio", monthlyAmount: 19755.96, lessee: { legalName: "Interio", contactName: "Denisse Emilia Peñaflor Castellanos" }, payments: PAID_Q1 },
        {
          code: "L4",
          name: "Interio 2",
          vacant: true,
          unitNotes: "Próximo posible inquilino: Aaron Miranda Salido (en negociación).",
        },
      ],
    },

    // 3. Plaza Quiroga 1
    {
      name: "Plaza Magnum Quiroga 1",
      type: PropertyType.PLAZA_COMERCIAL,
      address: "Perimetral Nte y Blvd Quiroga, Hermosillo",
      owner: "CRT",
      manager: "CRT",
      units: [
        { code: "LP", name: "7-Eleven", monthlyAmount: 41088.27, lessee: { legalName: "7-Eleven Mexico S.A de C.V." }, payments: PAID_Q1 },
        { code: "L.A", name: "Quesos Calza", monthlyAmount: 11048.32, lessee: { legalName: "Quesos Calza" }, payments: PAID_Q1 },
        { code: "L.B", name: "GI Similares", monthlyAmount: 11536.0, lessee: { legalName: "GI Similares", contactName: "Carlos Alberto Bernal Marquez" }, payments: PAID_Q1 },
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
        { code: "L1", name: "Sucree", monthlyAmount: 13484.39, lessee: { legalName: "Sucree" }, payments: PAID_Q1 },
        { code: "L2", name: "Dentista", monthlyAmount: 12210.72, lessee: { legalName: "Dentista" }, payments: PAID_Q1 },
        {
          code: "L3",
          name: "Cristianos",
          monthlyAmount: 12586.0,
          lessee: { legalName: "Cristianos" },
          contractNotes: "Local desocupado Ene–Feb 2026; contrato firmado en marzo.",
          contractStartDate: utcDate(YEAR, 2, 1), // 2026-03-01
          contractEndDate: utcDate(YEAR, 5, 30), // 2026-06-30
          rentStartMonth: 2, // desde marzo
          rentEndMonth: 5, // hasta junio
          payments: { 2: { kind: "paid" } },
        },
        { code: "L4", name: "Maki Sushi", monthlyAmount: 13020.83, lessee: { legalName: "Maki Sushi" }, payments: PAID_Q1 },
        { code: "L5", name: "Frituras Kikin", monthlyAmount: 13600.0, lessee: { legalName: "Frituras Kikin" }, payments: PAID_Q1 },
        { code: "L6", name: "Puro Pa' Delante", monthlyAmount: 13500.0, lessee: { legalName: "Puro Pa' Delante" }, payments: PAID_Q1 },
        {
          code: "L7",
          name: "Hitness",
          monthlyAmount: 13496.16,
          lessee: { legalName: "Hitness", notes: "Cliente con historial de pagos atrasados." },
          payments: {
            0: { kind: "paid" },
            1: { kind: "unpaid" },
            2: { kind: "paid" },
          },
        },
        { code: "L8", name: "Armando Elotes", monthlyAmount: 13746.0, lessee: { legalName: "Armando Elotes" }, payments: PAID_Q1 },
        { code: "E", name: "Medios Rubí (espectacular)", monthlyAmount: 2320.0, lessee: { legalName: "Medios Rubí" }, payments: PAID_Q1 },
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
        { code: "LP", name: "Banco Inbursa", monthlyAmount: 86028.56, lessee: { legalName: "Banco Inbursa" }, payments: PAID_Q1 },
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
          lessee: { legalName: "La Chila" },
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
        { code: "LP", name: "Inquilino actual", monthlyAmount: 19350.12, lessee: { legalName: "Inquilino Capilla del Carmen" }, payments: PAID_Q1 },
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
          lessee: { legalName: "Inquilino Oficina Elias" },
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
        { code: "OF", name: "Ferretería", monthlyAmount: 18560.0, lessee: { legalName: "Ferretería Nayarit" }, payments: PAID_Q1 },
      ],
    },

    // 10. Bodega — propiedad de JCL (Juan Carlos L), administrada por CRT.
    {
      name: "Bodega",
      type: PropertyType.BODEGA,
      address: "Bodega, Hermosillo",
      cadastralKey: "02074018",
      notes: "Propiedad de Juan Carlos L (JCL). CRT administra; predial lo paga el dueño.",
      owner: "JCL",
      manager: "CRT",
      units: [],
    },

    // 11. La Jolla — propiedad de JCL (Juan Carlos L), administrada por CRT.
    {
      name: "La Jolla",
      type: PropertyType.OTRO,
      address: "La Jolla, Hermosillo",
      cadastralKey: "14333037",
      notes: "Propiedad de Juan Carlos L (JCL). CRT administra; predial lo paga el dueño.",
      owner: "JCL",
      manager: "CRT",
      units: [],
    },

    // 12. Ma Escriba — propiedad CRT cuyo predial paga JC.
    {
      name: "Ma Escriba",
      type: PropertyType.OTRO,
      address: "Ma Escriba, Hermosillo",
      cadastralKey: "30204003",
      notes: "Predial pagado por terceros (JC).",
      owner: "CRT",
      manager: "CRT",
      units: [],
    },

    // 13. Serdán — dueña real Cecilia, predial lo paga CRT.
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
  ];

  for (const p of propsDef) {
    const property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        ownerEntityId: entities[p.owner].id,
        managerEntityId: entities[p.manager].id,
        name: p.name,
        type: p.type,
        address: p.address,
        cadastralKey: p.cadastralKey,
        notes: p.notes,
      },
    });

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

      if (u.vacant || !u.lessee || u.monthlyAmount === undefined) {
        continue;
      }

      const lessee = await prisma.lessee.create({
        data: {
          tenantId: tenant.id,
          legalName: u.lessee.legalName,
          contactName: u.lessee.contactName,
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
        const isAdvancePaid =
          u.paidThroughMonth !== undefined && m <= u.paidThroughMonth;
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
          const days = Math.floor(
            (TODAY.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
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
    { cadastralKey: "05436042", totalAmount: 10517.00, paidMonth: 5 }, // Plaza Olivares — JUNIO
    { cadastralKey: "15924002", totalAmount: 17085.00, paidMonth: 4 }, // Plaza Progreso — MAYO
    { cadastralKey: "03111002", totalAmount: 13969.00, paidMonth: 3 }, // Inbursa/Kino — pagado, sin mes en Excel; asumimos abril.
    { cadastralKey: "01119010", totalAmount: 8977.00, paidMonth: 3 }, // La Chila/Garmendia — ABRIL
    { cadastralKey: "51007086", totalAmount: 24881.00, paidMonth: 3 }, // Plaza Quiroga — pagado, sin mes; asumimos abril.
    { cadastralKey: "01179002", totalAmount: 805.00, paidMonth: 3, payer: "TSR" }, // Capilla del Carmen (CLICK) — paga TSR
    { cadastralKey: "01173002", totalAmount: 5277.00, paidMonth: 3, payer: "CRT", notes: "Dueña real: Cecilia." }, // Serdán — paga CRT
    { cadastralKey: "02074018", totalAmount: null, paidMonth: null, payer: "JCL" }, // Bodega — paga el dueño JCL
    { cadastralKey: "14333037", totalAmount: null, paidMonth: null, payer: "JCL" }, // La Jolla — paga el dueño JCL
    { cadastralKey: "30204003", totalAmount: null, paidMonth: null, paidByThirdPartyName: "JC" }, // Ma Escriba — propiedad CRT, predial lo paga JC como tercero
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

  // -- 7. Usuario admin de prueba ------------------------------------------
  const masterRole = await prisma.role.findUnique({
    where: { code: RoleCode.MASTER },
  });
  if (!masterRole) {
    throw new Error("Role MASTER no encontrado tras el upsert. Algo salió mal.");
  }
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "crm.inmobiliaria02@gmail.com",
      name: "Admin Demo",
      phone: "+526621151171",
      clerkId: null,
      roles: { create: [{ roleId: masterRole.id }] },
    },
  });

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
    cadastralCount,
    cadastralPaid,
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
          in: [
            RentStatus.DUE,
            RentStatus.OVERDUE_1M,
            RentStatus.OVERDUE_2M,
            RentStatus.OVERDUE_3M,
          ],
        },
      },
    }),
    prisma.payment.count(tenantWhere),
    prisma.guarantee.count(tenantWhere),
    prisma.expenseCategory.count(tenantWhere),
    prisma.cadastralPayment.count(tenantWhere),
    prisma.cadastralPayment.count({
      where: { tenantId: tenant.id, isPaid: true },
    }),
    prisma.user.count(tenantWhere),
  ]);

  console.log("\n========================================");
  console.log("✅ Seed completado: Plazas Magnum");
  console.log("========================================");
  console.log(`Tenants:                ${tenantsCount}`);
  console.log(`Razones sociales:       ${legalEntitiesCount}  (CRT, TSR, QHS, JCL)`);
  console.log(`Inmuebles (Property):   ${propertiesCount}`);
  console.log(`Unidades:               ${unitsTotal}  (${unitsRented} rentadas, ${unitsAvailable} disponibles)`);
  console.log(`Inquilinos (Lessee):    ${lesseesCount}`);
  console.log(`Contratos activos:      ${contractsCount}`);
  console.log(`Cargos (Rent):          ${rentsCount}  (${rentsPaid} pagados, ${rentsPartial} parciales, ${rentsOverdue} vencidos sin pago, ${rentsPending} a futuro)`);
  console.log(`Pagos registrados:      ${paymentsCount}`);
  console.log(`Depósitos en garantía:  ${guaranteesCount}`);
  console.log(`Categorías de gasto:    ${expenseCategoriesCount}`);
  console.log(`Prediales ${YEAR}:           ${cadastralCount}  (${cadastralPaid} pagados)`);
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
