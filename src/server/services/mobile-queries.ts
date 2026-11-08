import type { Prisma } from "@/generated/prisma/client";
import type {
  CommunicationChannel,
  ContractStatus,
  NotificationStatus,
  RentStatus,
} from "@/generated/prisma/enums";
import { requireAuth } from "@/server/auth/get-session";
import { OUTSTANDING_STATUSES } from "@/shared/constants/rent-statuses";
import { prisma } from "@/server/prisma/client";
import { computeBalance } from "@/server/services/rent-status";
import {
  currentPeriodStart,
  isOverdueStatus,
  rentSeverity,
  shortPropertyName,
} from "@/shared/mobile/format";
import type { ReminderLevel } from "@/server/pdf/template-config";

// Queries de la vista móvil (Rex iOS). Devuelven datos ya serializados
// (number / ISO string) para pasarlos tal cual a Client Components.

const DAY_MS = 24 * 60 * 60 * 1000;

export const REMINDER_TEMPLATE_CODE: Record<ReminderLevel, string> = {
  "1M": "RENT_REMINDER_1M",
  "2M": "RENT_REMINDER_2M",
  "3M": "RENT_REMINDER_3M_LEGAL",
};

export function reminderLevelForStatus(status: RentStatus): ReminderLevel | null {
  if (status === "OVERDUE_1M") return "1M";
  if (status === "OVERDUE_2M") return "2M";
  if (status === "OVERDUE_3M") return "3M";
  return null;
}

// ─── Rentas ──────────────────────────────────────────────────────────────────

const mobileRentSelect = {
  id: true,
  period: true,
  amountDue: true,
  amountPaid: true,
  amountWaived: true,
  lateFeeAccrued: true,
  status: true,
  legalEntity: { select: { code: true } },
  contract: {
    select: {
      lessee: { select: { id: true, legalName: true, whatsapp: true } },
      unit: { select: { code: true, property: { select: { name: true } } } },
    },
  },
} satisfies Prisma.RentSelect;

type RentWithContext = Prisma.RentGetPayload<{ select: typeof mobileRentSelect }>;

export interface MobileRent {
  rentId: string;
  lesseeId: string;
  lesseeName: string;
  unitCode: string;
  propertyName: string;
  /** ISO del primer día del periodo (UTC). */
  period: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: RentStatus;
  legalEntityCode: string;
}

function toMobileRent(r: RentWithContext): MobileRent {
  return {
    rentId: r.id,
    lesseeId: r.contract.lessee.id,
    lesseeName: r.contract.lessee.legalName,
    unitCode: r.contract.unit.code,
    propertyName: r.contract.unit.property.name,
    period: r.period.toISOString(),
    amountDue: Number(r.amountDue),
    amountPaid: Number(r.amountPaid),
    balance: computeBalance(r.amountDue, r.amountPaid, r.amountWaived, r.lateFeeAccrued).toNumber(),
    status: r.status,
    legalEntityCode: r.legalEntity.code,
  };
}

function bySeverity(a: MobileRent, b: MobileRent): number {
  return rentSeverity(a.status) - rentSeverity(b.status) || b.balance - a.balance;
}

/** Rentas del mes en curso, de lo más grave a lo pagado. */
export async function getMobileMonthRents(): Promise<MobileRent[]> {
  const { tenantId } = await requireAuth();
  const rents = await prisma.rent.findMany({
    where: { tenantId, period: currentPeriodStart() },
    select: mobileRentSelect,
  });
  return rents.map(toMobileRent).sort(bySeverity);
}

/**
 * Rentas a las que se puede aplicar un pago desde el sheet "¿A qué renta?":
 * todo lo pendiente de periodos pasados + lo no pagado del mes en curso.
 */
export async function getMobilePayableRents(): Promise<MobileRent[]> {
  const { tenantId } = await requireAuth();
  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      OR: [
        { status: { in: OUTSTANDING_STATUSES } },
        { status: "PENDING", period: currentPeriodStart() },
      ],
    },
    orderBy: { dueDate: "asc" },
    select: mobileRentSelect,
  });
  return rents.map(toMobileRent).sort(bySeverity);
}

// ─── Morosidad ───────────────────────────────────────────────────────────────

export interface MobileMorosityRow {
  lesseeId: string;
  lesseeName: string;
  whatsapp: string | null;
  /** "Progreso L1" — local de la renta más vencida. */
  unitLabel: string;
  rentCount: number;
  balance: number;
  worstStatus: RentStatus;
  level: ReminderLevel;
  /** Renta sobre la que se manda el aviso (la más antigua con el peor estado). */
  noticeRentId: string;
  /** Renta a la que se aplica "Registrar pago" (la más antigua pendiente). */
  payRent: MobileRent;
  /** Último aviso del nivel actual en los últimos 30 días (ISO) o null. */
  lastNoticeAt: string | null;
}

/**
 * Inquilinos con al menos una renta OVERDUE_*. El saldo suma TODAS sus rentas
 * pendientes (incluye DUE/PARTIAL), igual que el aviso de WhatsApp.
 */
export async function getMobileMorosity(): Promise<MobileMorosityRow[]> {
  const { tenantId } = await requireAuth();

  const rents = await prisma.rent.findMany({
    where: { tenantId, status: { in: OUTSTANDING_STATUSES } },
    orderBy: { dueDate: "asc" },
    select: mobileRentSelect,
  });

  const groups = new Map<string, { whatsapp: string | null; rents: MobileRent[] }>();
  for (const r of rents) {
    const lesseeId = r.contract.lessee.id;
    const g = groups.get(lesseeId) ?? { whatsapp: r.contract.lessee.whatsapp, rents: [] };
    g.rents.push(toMobileRent(r));
    groups.set(lesseeId, g);
  }

  const rows: Omit<MobileMorosityRow, "lastNoticeAt">[] = [];
  for (const [lesseeId, g] of groups) {
    // rents ya viene en orden cronológico (dueDate asc).
    const overdue = g.rents.filter((r) => isOverdueStatus(r.status));
    if (overdue.length === 0) continue;
    const worst = overdue.reduce((w, r) => (rentSeverity(r.status) < rentSeverity(w.status) ? r : w));
    const level = reminderLevelForStatus(worst.status);
    const payRent = g.rents[0];
    if (!level || !payRent) continue;
    rows.push({
      lesseeId,
      lesseeName: worst.lesseeName,
      whatsapp: g.whatsapp,
      unitLabel: `${shortPropertyName(worst.propertyName)} ${worst.unitCode}`,
      rentCount: g.rents.length,
      balance: g.rents.reduce((s, r) => s + r.balance, 0),
      worstStatus: worst.status,
      level,
      noticeRentId: worst.rentId,
      payRent,
    });
  }

  const lastNotices = await getRecentReminderNotices(
    tenantId,
    rows.map((r) => r.lesseeId),
  );

  return rows
    .map((r) => ({
      ...r,
      lastNoticeAt: lastNotices.get(`${r.lesseeId}:${REMINDER_TEMPLATE_CODE[r.level]}`) ?? null,
    }))
    .sort((a, b) => rentSeverity(a.worstStatus) - rentSeverity(b.worstStatus) || b.balance - a.balance);
}

/**
 * Avisos de morosidad "enviados" en los últimos 30 días, indexados por
 * `${lesseeId}:${templateCode}` → ISO de la fecha más reciente.
 *
 * Un log cuenta como enviado si Meta lo confirmó (SENT/DELIVERED/READ) o si
 * es un envío manual por wa.me: esos quedan en PENDING (no pasan por la API)
 * pero el AuditLog los marca con `manual: true`. Los PENDING del cron con
 * auto-envío apagado NO cuentan — siguen "sin enviar".
 */
async function getRecentReminderNotices(
  tenantId: string,
  lesseeIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (lesseeIds.length === 0) return result;

  const logs = await prisma.notificationLog.findMany({
    where: {
      tenantId,
      recipientType: "LESSEE",
      recipientId: { in: lesseeIds },
      templateCode: { in: Object.values(REMINDER_TEMPLATE_CODE) },
      status: { in: ["PENDING", "SENT", "DELIVERED", "READ"] },
      createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, recipientId: true, templateCode: true, status: true, createdAt: true },
  });

  const pendingIds = logs.filter((l) => l.status === "PENDING").map((l) => l.id);
  const manualIds = new Set(
    pendingIds.length === 0
      ? []
      : (
          await prisma.auditLog.findMany({
            where: {
              tenantId,
              entityType: "NotificationLog",
              entityId: { in: pendingIds },
              changes: { path: ["manual"], equals: true },
            },
            select: { entityId: true },
          })
        ).map((a) => a.entityId),
  );

  for (const l of logs) {
    if (l.status === "PENDING" && !manualIds.has(l.id)) continue;
    const key = `${l.recipientId}:${l.templateCode}`;
    if (!result.has(key)) result.set(key, l.createdAt.toISOString());
  }
  return result;
}

// ─── Inquilinos ──────────────────────────────────────────────────────────────

export interface MobileLesseeListItem {
  id: string;
  legalName: string;
  /** "Progreso · L1" (o varios locales separados por coma). */
  location: string;
  unitCodes: string[];
  /** Peor estado de renta del mes en curso, null si no tiene renta este mes. */
  monthStatus: RentStatus | null;
}

export async function getMobileLessees(): Promise<MobileLesseeListItem[]> {
  const { tenantId } = await requireAuth();
  const period = currentPeriodStart();

  const lessees = await prisma.lessee.findMany({
    where: { tenantId, isActive: true },
    orderBy: { legalName: "asc" },
    select: {
      id: true,
      legalName: true,
      contracts: {
        where: { status: "ACTIVE" },
        select: {
          unit: { select: { code: true, property: { select: { name: true } } } },
          rents: { where: { period }, select: { status: true } },
        },
      },
    },
  });

  return lessees.map((l) => {
    const units = l.contracts.map((c) => c.unit);
    const statuses = l.contracts.flatMap((c) => c.rents.map((r) => r.status));
    const worst = statuses.sort((a, b) => rentSeverity(a) - rentSeverity(b))[0] ?? null;
    const location = units
      .map((u) => `${shortPropertyName(u.property.name)} · ${u.code}`)
      .join(", ");
    return {
      id: l.id,
      legalName: l.legalName,
      location: location || "Sin contrato activo",
      unitCodes: units.map((u) => u.code),
      monthStatus: worst,
    };
  });
}

// ─── Detalle de inquilino ────────────────────────────────────────────────────

export interface MobileLesseeDetail {
  id: string;
  legalName: string;
  whatsapp: string | null;
  phone: string | null;
  location: string;
  balance: number;
  /** Peor estado de las rentas pendientes (o del mes si no debe nada). */
  status: RentStatus | null;
  /** Últimos 6 periodos, del más viejo al más reciente. */
  history: Array<{ period: string; status: RentStatus | null }>;
  /** Renta a la que se aplica "Registrar pago" (la más antigua pendiente). */
  payRent: MobileRent | null;
  contract: {
    status: ContractStatus;
    daysToExpire: number;
    monthlyAmount: number;
    startDate: string;
    endDate: string;
    guaranteeAmount: number;
    managerEntityCode: string;
  } | null;
  notices: Array<{
    id: string;
    templateCode: string | null;
    channel: CommunicationChannel;
    status: NotificationStatus;
    createdAt: string;
  }>;
}

export async function getMobileLesseeDetail(lesseeId: string): Promise<MobileLesseeDetail | null> {
  const { tenantId } = await requireAuth();
  const now = new Date();
  const currentPeriod = currentPeriodStart(now);
  const historyStart = new Date(
    Date.UTC(currentPeriod.getUTCFullYear(), currentPeriod.getUTCMonth() - 5, 1),
  );

  const [lessee, outstanding, historyRents, notices] = await Promise.all([
    prisma.lessee.findFirst({
      where: { id: lesseeId, tenantId },
      select: {
        id: true,
        legalName: true,
        whatsapp: true,
        phone: true,
        contracts: {
          orderBy: [{ status: "asc" }, { endDate: "desc" }],
          select: {
            status: true,
            monthlyAmount: true,
            startDate: true,
            endDate: true,
            guaranteeAmount: true,
            unit: {
              select: {
                code: true,
                property: { select: { name: true, managerEntity: { select: { code: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.rent.findMany({
      where: { tenantId, contract: { lesseeId }, status: { in: OUTSTANDING_STATUSES } },
      orderBy: { dueDate: "asc" },
      select: mobileRentSelect,
    }),
    prisma.rent.findMany({
      where: { tenantId, contract: { lesseeId }, period: { gte: historyStart, lte: currentPeriod } },
      select: { period: true, status: true },
    }),
    prisma.notificationLog.findMany({
      where: {
        tenantId,
        recipientType: "LESSEE",
        recipientId: lesseeId,
        templateCode: { in: Object.values(REMINDER_TEMPLATE_CODE) },
        createdAt: { gte: new Date(now.getTime() - 183 * DAY_MS) },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, templateCode: true, channel: true, status: true, createdAt: true },
    }),
  ]);

  if (!lessee) return null;

  const pending = outstanding.map(toMobileRent);
  const worstPending = [...pending].sort(bySeverity)[0];

  // Un inquilino con varios locales: por mes nos quedamos con el peor estado.
  const statusByPeriod = new Map<number, RentStatus>();
  for (const r of historyRents) {
    const key = r.period.getTime();
    const cur = statusByPeriod.get(key);
    if (!cur || rentSeverity(r.status) < rentSeverity(cur)) statusByPeriod.set(key, r.status);
  }
  const history = Array.from({ length: 6 }, (_, i) => {
    const p = new Date(Date.UTC(historyStart.getUTCFullYear(), historyStart.getUTCMonth() + i, 1));
    return { period: p.toISOString(), status: statusByPeriod.get(p.getTime()) ?? null };
  });

  const contract =
    lessee.contracts.find((c) => c.status === "ACTIVE" || c.status === "PENDING_RENEWAL") ??
    lessee.contracts[0] ??
    null;

  return {
    id: lessee.id,
    legalName: lessee.legalName,
    whatsapp: lessee.whatsapp,
    phone: lessee.phone,
    location: contract
      ? `${shortPropertyName(contract.unit.property.name)} · ${contract.unit.code}`
      : "Sin contrato",
    balance: pending.reduce((s, r) => s + r.balance, 0),
    status: worstPending?.status ?? history[history.length - 1]?.status ?? null,
    history,
    payRent: pending[0] ?? null,
    contract: contract
      ? {
          status: contract.status,
          daysToExpire: Math.ceil((contract.endDate.getTime() - now.getTime()) / DAY_MS),
          monthlyAmount: Number(contract.monthlyAmount),
          startDate: contract.startDate.toISOString(),
          endDate: contract.endDate.toISOString(),
          guaranteeAmount: Number(contract.guaranteeAmount),
          managerEntityCode: contract.unit.property.managerEntity.code,
        }
      : null,
    notices: notices.map((n) => ({
      id: n.id,
      templateCode: n.templateCode,
      channel: n.channel,
      status: n.status,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

// ─── Egresos ─────────────────────────────────────────────────────────────────

export interface MobileExpenseRow {
  id: string;
  categoryName: string;
  legalEntityCode: string;
  propertyName: string | null;
  expenseDate: string;
  amount: number;
  isPaid: boolean;
  hasReceipt: boolean;
}

/** Egresos del mes en curso (sin nómina: vive en su propio módulo). */
export async function getMobileMonthExpenses(): Promise<MobileExpenseRow[]> {
  const { tenantId } = await requireAuth();
  const start = currentPeriodStart();
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      expenseDate: { gte: start, lt: end },
      isNotRequired: false,
      category: { type: { not: "PAYROLL" } },
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amount: true,
      expenseDate: true,
      isPaid: true,
      propertyId: true,
      category: { select: { name: true } },
      legalEntity: { select: { code: true } },
      _count: { select: { documents: true } },
    },
  });

  // Expense no declara relación a Property: resolvemos nombres en una query aparte.
  const propertyIds = [...new Set(expenses.map((e) => e.propertyId).filter((id): id is string => !!id))];
  const properties = propertyIds.length
    ? await prisma.property.findMany({
        where: { tenantId, id: { in: propertyIds } },
        select: { id: true, name: true },
      })
    : [];
  const propertyName = new Map(properties.map((p) => [p.id, p.name]));

  return expenses.map((e) => ({
    id: e.id,
    categoryName: e.category.name,
    legalEntityCode: e.legalEntity.code,
    propertyName: e.propertyId ? (propertyName.get(e.propertyId) ?? null) : null,
    expenseDate: e.expenseDate.toISOString(),
    amount: Number(e.amount),
    isPaid: e.isPaid,
    hasReceipt: e._count.documents > 0,
  }));
}

// ─── Contadores del shell / pantalla "Más" ───────────────────────────────────

/** Rentas vencidas (OVERDUE_*) — badge del tab Cobranza. */
export async function getMobileOverdueRentCount(): Promise<number> {
  const { tenantId } = await requireAuth();
  return prisma.rent.count({
    where: { tenantId, status: { in: ["OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"] } },
  });
}

export async function getMobileOverdueMaintenanceCount(): Promise<number> {
  const { tenantId } = await requireAuth();
  return prisma.maintenance.count({ where: { tenantId, status: "OVERDUE" } });
}

export async function getMobileMoreCounts(): Promise<{
  contractsToRenew: number;
  lessees: number;
  overdueMaintenances: number;
  monthExpensesTotal: number;
}> {
  const { tenantId } = await requireAuth();
  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * DAY_MS);
  const start = currentPeriodStart(now);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const [contractsToRenew, lessees, overdueMaintenances, expenses] = await Promise.all([
    prisma.contract.count({
      where: {
        tenantId,
        OR: [
          { status: "PENDING_RENEWAL" },
          { status: "ACTIVE", endDate: { gte: now, lte: horizon } },
        ],
      },
    }),
    prisma.lessee.count({ where: { tenantId, isActive: true } }),
    getMobileOverdueMaintenanceCount(),
    prisma.expense.aggregate({
      where: {
        tenantId,
        expenseDate: { gte: start, lt: end },
        isNotRequired: false,
        category: { type: { not: "PAYROLL" } },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    contractsToRenew,
    lessees,
    overdueMaintenances,
    monthExpensesTotal: Number(expenses._sum.amount ?? 0),
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface MobileDashboardData {
  legalEntities: Array<{ id: string; code: string }>;
  pending: { porCobrar: number; avisosSinEnviar: number; mantenimientosAtrasados: number };
  kpis: { ventas: number; egresos: number; utilidad: number; rentabilidad: number };
  cobranza: {
    pct: number;
    collected: number;
    expected: number;
    paid: number;
    partial: number;
    pending: number;
    overdue: number;
  };
  alerts: Array<{ level: "warning" | "critical"; message: string }>;
  topOverdue: Array<{
    lesseeId: string;
    legalName: string;
    unitLabel: string;
    total: number;
    count: number;
    worstStatus: RentStatus;
  }>;
  byLegalEntity: Array<{ id: string; code: string; income: number; profit: number; rent: number }>;
  ranking: Array<{
    id: string;
    name: string;
    expectedMonthly: number;
    totalUnits: number;
    rentedUnits: number;
  }>;
}

/**
 * Datos del dashboard móvil. El de escritorio solo muestra los 10 KPIs
 * (getKpiSet); el móvil conserva ventas/egresos, cobranza del mes, alertas,
 * top adeudos, resumen por razón social y ranking de plazas.
 */
export async function getMobileDashboardData(params: {
  legalEntityId: string | undefined;
  mode: "anual" | "mensual";
  selectedMonth: number;
}): Promise<MobileDashboardData> {
  const { tenantId } = await requireAuth();
  const { legalEntityId, mode, selectedMonth } = params;

  const now          = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const periodStart = mode === "anual"
    ? new Date(Date.UTC(currentYear, 0, 1))
    : new Date(Date.UTC(currentYear, selectedMonth, 1));
  const periodEnd = mode === "anual"
    ? new Date(Date.UTC(currentYear + 1, 0, 1))
    : new Date(Date.UTC(currentYear, selectedMonth + 1, 1));

  // El semáforo siempre refleja el mes en curso
  const currentMonthStart = new Date(Date.UTC(currentYear, currentMonth, 1));

  const leFilter        = legalEntityId ? { legalEntityId } : {};
  const paymentLeFilter = legalEntityId ? { rent: { legalEntityId } } : {};
  const propLeFilter    = legalEntityId ? { managerEntityId: legalEntityId } : {};

  const [
    ventas,
    egresos,
    propertiesWithUnits,
    overdueRentsRaw,
    paymentsDetail,
    expensesDetail,
    legalEntities,
    cobranzaMonthRents,
    morosity,
    overdueMaintenances,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { tenantId, paymentDate: { gte: periodStart, lt: periodEnd }, ...paymentLeFilter },
      _sum: { amount: true },
    }),
    // Sólo egresos ya pagados, para comparar contra dinero efectivamente cobrado.
    prisma.expense.aggregate({
      where: { tenantId, expenseDate: { gte: periodStart, lt: periodEnd }, isPaid: true, ...leFilter },
      _sum: { amount: true },
    }),
    prisma.property.findMany({
      where: { tenantId, isActive: true, ...propLeFilter },
      select: {
        id: true,
        name: true,
        units: {
          where: { isActive: true },
          select: {
            status: true,
            contracts: {
              where: { status: "ACTIVE" },
              take: 1,
              select: {
                monthlyAmount: true,
                rents: {
                  where: { period: currentMonthStart },
                  take: 1,
                  select: { status: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.rent.findMany({
      where: { tenantId, status: { in: [...OUTSTANDING_STATUSES] }, ...leFilter },
      select: {
        amountDue: true,
        amountPaid: true,
        amountWaived: true,
        lateFeeAccrued: true,
        status: true,
        contract: {
          select: {
            lessee: { select: { id: true, legalName: true } },
            unit: { select: { code: true, property: { select: { name: true } } } },
          },
        },
      },
    }),
    // Resumen por razón social y ranking de plazas: sin filtro de LE
    prisma.payment.findMany({
      where: { tenantId, paymentDate: { gte: periodStart, lt: periodEnd } },
      select: {
        amount: true,
        rent: {
          select: {
            legalEntityId: true,
            contract: { select: { unit: { select: { propertyId: true } } } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { tenantId, expenseDate: { gte: periodStart, lt: periodEnd }, isPaid: true },
      select: { amount: true, legalEntityId: true },
    }),
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    }),
    // Cobranza del mes en curso (independiente del periodo del dashboard)
    prisma.rent.findMany({
      where: { tenantId, period: currentMonthStart, ...leFilter },
      select: { status: true, amountDue: true, amountPaid: true },
    }),
    getMobileMorosity(),
    getMobileOverdueMaintenanceCount(),
  ]);

  // ── Cobranza mes en curso ──
  const cobranzaExpected  = cobranzaMonthRents.reduce((s, r) => s + Number(r.amountDue), 0);
  const cobranzaCollected = cobranzaMonthRents.reduce((s, r) => s + Number(r.amountPaid), 0);
  let paid = 0, partial = 0, pending = 0, overdue = 0;
  for (const r of cobranzaMonthRents) {
    if (r.status === "PAID") paid++;
    else if (r.status === "PARTIAL") partial++;
    else if (r.status === "PENDING" || r.status === "DUE") pending++;
    else if (isOverdueStatus(r.status)) overdue++;
  }

  // ── KPIs ──
  const ventasTotal  = Number(ventas._sum.amount ?? 0);
  const egresosTotal = Number(egresos._sum.amount ?? 0);
  const utilidad     = ventasTotal - egresosTotal;

  // ── Resumen por razón social ──
  const incomeByLE   = new Map<string, number>();
  const expensesByLE = new Map<string, number>();
  for (const p of paymentsDetail)
    incomeByLE.set(p.rent.legalEntityId, (incomeByLE.get(p.rent.legalEntityId) ?? 0) + Number(p.amount));
  for (const e of expensesDetail)
    expensesByLE.set(e.legalEntityId, (expensesByLE.get(e.legalEntityId) ?? 0) + Number(e.amount));
  const byLegalEntity = legalEntities.map((le) => {
    const income = incomeByLE.get(le.id) ?? 0;
    const profit = income - (expensesByLE.get(le.id) ?? 0);
    return { id: le.id, code: le.code, income, profit, rent: income > 0 ? profit / income : 0 };
  });

  // ── Ranking de plazas ──
  const collectedByProp = new Map<string, number>();
  for (const p of paymentsDetail) {
    const propId = p.rent.contract.unit.propertyId;
    collectedByProp.set(propId, (collectedByProp.get(propId) ?? 0) + Number(p.amount));
  }
  const ranking = propertiesWithUnits
    .map((p) => ({
      id: p.id,
      name: p.name,
      expectedMonthly: p.units.reduce(
        (s, u) => s + (u.contracts[0] ? Number(u.contracts[0].monthlyAmount) : 0),
        0,
      ),
      totalUnits: p.units.length,
      rentedUnits: p.units.filter((u) => u.status === "RENTADA").length,
    }))
    .filter((p) => p.expectedMonthly > 0)
    .sort((a, b) => b.expectedMonthly - a.expectedMonthly);

  // ── Alertas ──
  const alerts: MobileDashboardData["alerts"] = [];
  const totalSinRenta = propertiesWithUnits.reduce(
    (s, p) => s + p.units.filter((u) => u.status !== "RENTADA").length, 0,
  );
  if (totalSinRenta > 0)
    alerts.push({ level: "warning", message: `${totalSinRenta} local${totalSinRenta > 1 ? "es" : ""} sin renta activa.` });
  const totalNoPago = propertiesWithUnits.reduce((s, p) =>
    s + p.units.filter((u) => {
      if (u.status !== "RENTADA" || !u.contracts[0]) return false;
      const st = u.contracts[0].rents[0]?.status;
      return st && st !== "PAID" && st !== "PENDING";
    }).length, 0,
  );
  if (totalNoPago > 0)
    alerts.push({
      level: totalNoPago > 3 ? "critical" : "warning",
      message: `${totalNoPago} local${totalNoPago > 1 ? "es" : ""} con renta pendiente de cobro.`,
    });
  const overdue3M = overdueRentsRaw.filter((r) => r.status === "OVERDUE_3M").length;
  if (overdue3M > 0)
    alerts.push({ level: "critical", message: `${overdue3M} renta${overdue3M > 1 ? "s" : ""} con 3+ meses vencidos. Requieren acción.` });

  // ── Top adeudos (agrupado por inquilino, peor estatus) ──
  const overdueMap = new Map<string, MobileDashboardData["topOverdue"][number]>();
  for (const r of overdueRentsRaw) {
    const l   = r.contract.lessee;
    const bal = computeBalance(r.amountDue, r.amountPaid, r.amountWaived, r.lateFeeAccrued).toNumber();
    const cur = overdueMap.get(l.id);
    if (cur) {
      cur.total += bal;
      cur.count += 1;
      // rentSeverity: menor = más grave
      if (rentSeverity(r.status) < rentSeverity(cur.worstStatus)) cur.worstStatus = r.status;
    } else {
      overdueMap.set(l.id, {
        lesseeId: l.id,
        legalName: l.legalName,
        unitLabel: `${r.contract.unit.code} · ${shortPropertyName(r.contract.unit.property.name)}`,
        total: bal,
        count: 1,
        worstStatus: r.status,
      });
    }
  }

  return {
    legalEntities,
    pending: {
      porCobrar: cobranzaMonthRents.filter(
        (r) => r.status === "PENDING" || r.status === "DUE" || r.status === "PARTIAL",
      ).length,
      avisosSinEnviar: morosity.filter((m) => !m.lastNoticeAt).length,
      mantenimientosAtrasados: overdueMaintenances,
    },
    kpis: {
      ventas: ventasTotal,
      egresos: egresosTotal,
      utilidad,
      rentabilidad: ventasTotal > 0 ? utilidad / ventasTotal : 0,
    },
    cobranza: {
      pct: cobranzaExpected > 0 ? Math.round((cobranzaCollected / cobranzaExpected) * 100) : 0,
      collected: cobranzaCollected,
      expected: cobranzaExpected,
      paid,
      partial,
      pending,
      overdue,
    },
    alerts,
    topOverdue: Array.from(overdueMap.values()).sort((a, b) => b.total - a.total).slice(0, 5),
    byLegalEntity,
    ranking,
  };
}
