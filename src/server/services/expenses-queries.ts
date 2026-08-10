import { getActiveLegalEntityId } from "@/server/auth/active-legal-entity";
import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";

export interface ExpenseListFilters {
  year?: number;
  month?: number; // 1-12, opcional
  legalEntityId?: string;
  categoryId?: string;
}

/**
 * Listado de egresos con filtros de año/mes/razón social/categoría.
 * Si `legalEntityId` no viene en filtros, se aplica el filtro global de la
 * topbar (cookie de Active LegalEntity).
 */
export async function getExpenses(filters: ExpenseListFilters = {}) {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();
  const legalEntityId = filters.legalEntityId ?? activeLegalEntityId ?? undefined;

  const dateFilter = buildDateFilter(filters.year, filters.month);

  const rows = await prisma.expense.findMany({
    where: {
      tenantId,
      // Las nóminas se gestionan en /nominas (modelo Payroll + categorías
      // PAYROLL en Expense). Aquí ocultamos cualquier expense PAYROLL para
      // que no se dupliquen en la vista.
      category: { type: { not: "PAYROLL" } },
      ...(legalEntityId ? { legalEntityId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(dateFilter ? { expenseDate: dateFilter } : {}),
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    take: 5000,
    include: {
      legalEntity: { select: { id: true, code: true, legalName: true } },
      category: { select: { id: true, code: true, name: true, type: true } },
    },
  });

  // Expense.propertyId no tiene relación inversa en el schema, así que
  // mapeamos los nombres aparte con una sola query.
  const propertyIds = Array.from(
    new Set(rows.map((r) => r.propertyId).filter((id): id is string => !!id)),
  );
  const propertyMap = new Map<string, { id: string; name: string }>();
  if (propertyIds.length > 0) {
    const props = await prisma.property.findMany({
      where: { tenantId, id: { in: propertyIds } },
      select: { id: true, name: true },
    });
    for (const p of props) propertyMap.set(p.id, p);
  }

  return rows.map((r) => ({
    id: r.id,
    legalEntity: r.legalEntity,
    category: r.category,
    property: r.propertyId ? (propertyMap.get(r.propertyId) ?? null) : null,
    amount: r.amount.toNumber(),
    expenseDate: r.expenseDate,
    description: r.description,
    vendor: r.vendor,
    invoiceNumber: r.invoiceNumber,
    paymentMethod: r.paymentMethod,
    isPaid: r.isPaid,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export type ExpenseListItem = Awaited<ReturnType<typeof getExpenses>>[number];

function buildDateFilter(year?: number, month?: number) {
  if (!year) return null;
  if (month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { gte: start, lt: end };
  }
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return { gte: start, lt: end };
}

/** Categorías de egreso para el form y los filtros (solo activas). */
export async function getExpenseCategories() {
  const { tenantId } = await requireAuth();
  return prisma.expenseCategory.findMany({
    where: { tenantId, type: { not: "PAYROLL" }, isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isRecurring: true,
    },
  });
}

export type ExpenseCategoryOption = Awaited<
  ReturnType<typeof getExpenseCategories>
>[number];

/**
 * Todas las categorías de egreso (activas y archivadas) con su uso, para la UI
 * de administración de conceptos. Incluye el conteo de egresos para advertir
 * antes de archivar un concepto en uso.
 */
export async function getManagedExpenseCategories() {
  const { tenantId } = await requireAuth();
  return prisma.expenseCategory.findMany({
    where: { tenantId, type: { not: "PAYROLL" } },
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      _count: { select: { expenses: true } },
    },
  });
}

export type ManagedExpenseCategory = Awaited<
  ReturnType<typeof getManagedExpenseCategories>
>[number];

/** Inmuebles para asociar a un egreso (opcional en el form). */
export async function getPropertiesForExpenseForm() {
  const { tenantId } = await requireAuth();
  return prisma.property.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type ExpensePropertyOption = Awaited<
  ReturnType<typeof getPropertiesForExpenseForm>
>[number];

// ============================================================================
// MATRIZ ANUAL DE EGRESOS (formato espejo de Ingresos)
// ============================================================================

// EMPTY  → no hay registro de egreso para esa celda (no aplica acción).
// VACIO  → existe registro pero el mes aún es futuro (no se puede registrar).
// PENDING → existe registro y el mes es actual o pasado, sin pagar.
// PAID   → registrado y pagado.
// NOT_REQUIRED → marcado manualmente como "Sin egreso" (no aplica este mes).
export type MonthlyExpenseStatus =
  | "PAID"
  | "PENDING"
  | "VACIO"
  | "EMPTY"
  | "NOT_REQUIRED";

export interface YearlyExpenseCell {
  expenseId: string | null;
  amount: number;
  isPaid: boolean;
  isNotRequired: boolean;
  status: MonthlyExpenseStatus;
  period: Date;
}

export interface YearlyExpenseRow {
  /** Estable por (categoryId + description) — sirve de key en React. */
  conceptKey: string;
  description: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  cells: YearlyExpenseCell[]; // 12
  expectedTotal: number;
  paidTotal: number;
  isPayroll: boolean;
}

export interface YearlyExpenseEntityGroup {
  entityId: string;
  entityCode: string;
  entityLegalName: string;
  rows: YearlyExpenseRow[];
  expectedTotal: number;
  paidTotal: number;
  conceptCount: number;
}

export interface YearlyExpenses {
  year: number;
  entities: YearlyExpenseEntityGroup[];
  monthlyTotals: Array<{
    period: Date;
    expected: number;
    paid: number;
    paidCount: number;
    pendingCount: number;
  }>;
}

/**
 * Devuelve el año entero de egresos en forma de matriz:
 *   por LegalEntity → filas (categoría + descripción) × 12 meses.
 * Excluye PAYROLL (se maneja en /nominas).
 */
export async function getYearlyExpensesMatrix(
  year: number,
): Promise<YearlyExpenses> {
  const { tenantId } = await requireAuth();

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const periods: Date[] = Array.from(
    { length: 12 },
    (_, i) => new Date(Date.UTC(year, i, 1)),
  );

  // Cargamos en paralelo: expenses planos (sólo IDs de FK) + entidades + categorías + nóminas.
  // Evita el `include` que dispara `IN ($1..$N)` con N = nº de expenses, aunque
  // sólo existan ~4 entidades y ~17 categorías. Resolvemos por map en memoria.
  const [rows, legalEntities, categories, payrollRows] = await Promise.all([
    prisma.expense.findMany({
      where: {
        tenantId,
        category: { type: { not: "PAYROLL" } },
        expenseDate: { gte: yearStart, lt: yearEnd },
      },
      orderBy: [{ expenseDate: "asc" }],
      take: 5000,
      select: {
        id: true,
        legalEntityId: true,
        categoryId: true,
        amount: true,
        expenseDate: true,
        description: true,
        isPaid: true,
        isNotRequired: true,
      },
    }),
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, legalName: true },
    }),
    prisma.expenseCategory.findMany({
      where: { tenantId, type: { not: "PAYROLL" } },
      select: { id: true, code: true, name: true },
    }),
    prisma.payroll.findMany({
      where: { tenantId, period: { gte: yearStart, lt: yearEnd } },
      select: {
        id: true,
        legalEntityId: true,
        period: true,
        type: true,
        amount: true,
        description: true,
      },
    }),
  ]);
  const entityMap = new Map(legalEntities.map((e) => [e.id, e]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Estructura: entity → conceptKey → row
  const byEntity = new Map<
    string,
    {
      entityId: string;
      entityCode: string;
      entityLegalName: string;
      rows: Map<string, YearlyExpenseRow>;
    }
  >();

  for (const r of rows) {
    const entity_ = entityMap.get(r.legalEntityId);
    const category_ = categoryMap.get(r.categoryId);
    if (!entity_ || !category_) continue; // entidad/categoría inactiva — ignoramos.

    let entity = byEntity.get(entity_.id);
    if (!entity) {
      entity = {
        entityId: entity_.id,
        entityCode: entity_.code,
        entityLegalName: entity_.legalName,
        rows: new Map(),
      };
      byEntity.set(entity_.id, entity);
    }

    const conceptKey = `${r.categoryId}::${r.description}`;
    let row = entity.rows.get(conceptKey);
    if (!row) {
      row = {
        conceptKey,
        description: r.description,
        categoryId: r.categoryId,
        categoryCode: category_.code,
        categoryName: category_.name,
        cells: periods.map((p) => ({
          expenseId: null,
          amount: 0,
          isPaid: false,
          isNotRequired: false,
          status: "EMPTY",
          period: p,
        })),
        expectedTotal: 0,
        paidTotal: 0,
        isPayroll: false,
      };
      entity.rows.set(conceptKey, row);
    }

    const monthIdx = r.expenseDate.getUTCMonth();
    const cell = row.cells[monthIdx]!;
    const amount = r.amount.toNumber();

    // Si ya hay un expenseId para este mes (caso raro: dos expenses con el
    // mismo concepto y mes), sumamos montos pero conservamos el primer
    // expenseId — el click del cell abrirá ese.
    if (cell.expenseId === null) {
      cell.expenseId = r.id;
      cell.isPaid = r.isPaid;
      cell.isNotRequired = r.isNotRequired;
    } else {
      // Mezcla: si alguno está sin pagar, la celda queda pending.
      cell.isPaid = cell.isPaid && r.isPaid;
      cell.isNotRequired = cell.isNotRequired && r.isNotRequired;
    }
    cell.amount += amount;
  }

  // Agregar filas de nómina (Payroll) como filas sintéticas con isPayroll=true.
  // Las celdas con registro muestran PAID; celdas sin registro quedan EMPTY.
  const PAYROLL_LABELS: Record<string, string> = {
    DIRECT_PAYROLL: "Nómina directa",
    STRATEGY_NOMINA: "Nómina estratégica",
    ADMIN_SERVICE_INVOICE: "Fact. Serv. Adm.",
    COMMISSION: "Comisión",
    BONUS: "Bono",
  };

  for (const p of payrollRows) {
    const entity_ = entityMap.get(p.legalEntityId);
    if (!entity_) continue;

    let entity = byEntity.get(entity_.id);
    if (!entity) {
      entity = {
        entityId: entity_.id,
        entityCode: entity_.code,
        entityLegalName: entity_.legalName,
        rows: new Map(),
      };
      byEntity.set(entity_.id, entity);
    }

    const label = PAYROLL_LABELS[p.type] ?? p.type;
    const desc = p.description ?? label;
    const conceptKey = `payroll::${p.type}::${desc}`;

    let row = entity.rows.get(conceptKey);
    if (!row) {
      row = {
        conceptKey,
        description: desc,
        categoryId: `payroll::${p.type}`,
        categoryCode: p.type,
        categoryName: label,
        cells: periods.map((period) => ({
          expenseId: null,
          amount: 0,
          isPaid: false,
          isNotRequired: false,
          status: "EMPTY" as MonthlyExpenseStatus,
          period,
        })),
        expectedTotal: 0,
        paidTotal: 0,
        isPayroll: true,
      };
      entity.rows.set(conceptKey, row);
    }

    const monthIdx = p.period.getUTCMonth();
    const cell = row.cells[monthIdx]!;
    const amount = p.amount.toNumber();
    cell.amount += amount;
    cell.status = "PAID";
    row.expectedTotal += amount;
    row.paidTotal += amount;
  }

  // Pasar a calcular el status final de cada celda usando la fecha de hoy
  // (UTC) como cutoff: meses futuros → VACIO, mes actual o pasado → PENDING.
  // Los totales se computan aquí también: NOT_REQUIRED no suma a expected.
  const now = new Date();
  const currentMonthStartUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  for (const entity of byEntity.values()) {
    for (const row of entity.rows.values()) {
      if (row.isPayroll) continue; // status y totales ya se calcularon al construir la fila
      for (const cell of row.cells) {
        if (cell.expenseId === null) {
          cell.status = "EMPTY";
          continue;
        }
        if (cell.isPaid) {
          cell.status = "PAID";
          row.expectedTotal += cell.amount;
          row.paidTotal += cell.amount;
        } else if (cell.isNotRequired) {
          cell.status = "NOT_REQUIRED";
          // Sin egreso: no suma a expectedTotal ni paidTotal.
        } else if (cell.period.getTime() > currentMonthStartUTC.getTime()) {
          cell.status = "VACIO";
          row.expectedTotal += cell.amount;
        } else {
          cell.status = "PENDING";
          row.expectedTotal += cell.amount;
        }
      }
    }
  }

  // Ordenar filas dentro de cada entity por (categoryName, description) para
  // mantener un orden estable parecido al Excel.
  const entities: YearlyExpenseEntityGroup[] = Array.from(byEntity.values())
    .map((e) => {
      const rowList = Array.from(e.rows.values()).sort((a, b) => {
        if (a.isPayroll !== b.isPayroll) return a.isPayroll ? 1 : -1;
        if (a.categoryName !== b.categoryName) {
          return a.categoryName.localeCompare(b.categoryName);
        }
        return a.description.localeCompare(b.description);
      });
      const expectedTotal = rowList.reduce((acc, r) => acc + r.expectedTotal, 0);
      const paidTotal = rowList.reduce((acc, r) => acc + r.paidTotal, 0);
      return {
        entityId: e.entityId,
        entityCode: e.entityCode,
        entityLegalName: e.entityLegalName,
        rows: rowList,
        expectedTotal,
        paidTotal,
        conceptCount: rowList.length,
      };
    })
    .sort((a, b) => b.expectedTotal - a.expectedTotal);

  // Totales mensuales globales. NOT_REQUIRED y EMPTY no suman.
  const monthlyTotals = periods.map((period, i) => {
    let expected = 0;
    let paid = 0;
    let paidCount = 0;
    let pendingCount = 0;
    for (const e of entities) {
      for (const row of e.rows) {
        const cell = row.cells[i]!;
        if (cell.status === "EMPTY" || cell.status === "NOT_REQUIRED") continue;
        expected += cell.amount;
        if (cell.status === "PAID") {
          paid += cell.amount;
          paidCount++;
        } else if (cell.status === "PENDING") {
          // VACIO no se cuenta como pendiente — aún no es momento de pagar.
          pendingCount++;
        }
      }
    }
    return { period, expected, paid, paidCount, pendingCount };
  });

  return { year, entities, monthlyTotals };
}

