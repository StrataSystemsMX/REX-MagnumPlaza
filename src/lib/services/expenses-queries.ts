import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

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
      ...(legalEntityId ? { legalEntityId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(dateFilter ? { expenseDate: dateFilter } : {}),
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
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

/** Categorías de egreso para el form y los filtros. */
export async function getExpenseCategories() {
  const { tenantId } = await requireAuth();
  return prisma.expenseCategory.findMany({
    where: { tenantId },
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

/** Años con al menos un egreso registrado, descendente. */
export async function getExpenseYears(): Promise<number[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.expense.findMany({
    where: { tenantId },
    select: { expenseDate: true },
  });
  const years = new Set<number>();
  for (const r of rows) years.add(r.expenseDate.getUTCFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
