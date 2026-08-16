import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
const legalEntityMock = { findMany: vi.fn() };
const expenseMock = { findMany: vi.fn() };

vi.mock("@/server/auth/get-session", () => ({
  requireAuth: () => mockRequireAuth(),
}));
vi.mock("@/server/auth/active-legal-entity", () => ({
  getActiveLegalEntityId: () => Promise.resolve(null),
}));
vi.mock("@/server/prisma/client", () => ({
  prisma: {
    legalEntity: legalEntityMock,
    expense: expenseMock,
  },
}));

const TENANT = "tenant-1";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ tenantId: TENANT });
});

describe("diffMissingRecurringExpenses (pura)", () => {
  it("marca como faltante lo que estaba el mes pasado y no está este mes", async () => {
    const { diffMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    const missing = diffMissingRecurringExpenses(
      [{ legalEntityId: "crt", categoryId: "cfe" }],
      [],
      new Map([["crt", "CRT"]]),
      new Map([["cfe", "CFE"]]),
    );
    expect(missing).toEqual([
      { legalEntityId: "crt", legalEntityCode: "CRT", categoryId: "cfe", categoryName: "CFE" },
    ]);
  });

  it("no marca nada si ya hay registro este mes para esa combinación", async () => {
    const { diffMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    const missing = diffMissingRecurringExpenses(
      [{ legalEntityId: "crt", categoryId: "cfe" }],
      [{ legalEntityId: "crt", categoryId: "cfe" }],
      new Map([["crt", "CRT"]]),
      new Map([["cfe", "CFE"]]),
    );
    expect(missing).toEqual([]);
  });

  it("no marca una combinación que nunca tuvo precedente el mes pasado", async () => {
    const { diffMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    // TSR nunca pagó "Gasolina" — no hay fila en prevMonthRefs para ese par.
    const missing = diffMissingRecurringExpenses(
      [{ legalEntityId: "crt", categoryId: "gasolina" }],
      [],
      new Map([["crt", "CRT"], ["tsr", "TSR"]]),
      new Map([["gasolina", "Gasolina"]]),
    );
    expect(missing.every((m) => m.legalEntityId !== "tsr")).toBe(true);
  });

  it("no duplica si el mes pasado hubo dos Expense de la misma categoría/entidad", async () => {
    const { diffMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    const missing = diffMissingRecurringExpenses(
      [
        { legalEntityId: "crt", categoryId: "cfe" },
        { legalEntityId: "crt", categoryId: "cfe" },
      ],
      [],
      new Map([["crt", "CRT"]]),
      new Map([["cfe", "CFE"]]),
    );
    expect(missing).toHaveLength(1);
  });

  it("omite una combinación cuya entidad o categoría ya no está activa (no aparece en los mapas)", async () => {
    const { diffMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    const missing = diffMissingRecurringExpenses(
      [{ legalEntityId: "crt-archivada", categoryId: "cfe" }],
      [],
      new Map(), // entidad ya no está en el mapa de activas
      new Map([["cfe", "CFE"]]),
    );
    expect(missing).toEqual([]);
  });

  it("ordena por código de entidad y luego por nombre de categoría", async () => {
    const { diffMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    const missing = diffMissingRecurringExpenses(
      [
        { legalEntityId: "tsr", categoryId: "agua" },
        { legalEntityId: "crt", categoryId: "telmex" },
        { legalEntityId: "crt", categoryId: "cfe" },
      ],
      [],
      new Map([["crt", "CRT"], ["tsr", "TSR"]]),
      new Map([["agua", "Agua"], ["telmex", "Telmex"], ["cfe", "CFE"]]),
    );
    expect(missing.map((m) => `${m.legalEntityCode}:${m.categoryName}`)).toEqual([
      "CRT:CFE",
      "CRT:Telmex",
      "TSR:Agua",
    ]);
  });
});

describe("getMissingRecurringExpenses", () => {
  it("solo consulta Expense de categorías recurrentes, activas y no-PAYROLL", async () => {
    legalEntityMock.findMany.mockResolvedValue([{ id: "crt", code: "CRT" }]);
    expenseMock.findMany.mockResolvedValue([]);

    const { getMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    await getMissingRecurringExpenses(utc(2026, 7, 15));

    const call = expenseMock.findMany.mock.calls[0]?.[0] as {
      where: { category: { isRecurring: boolean; isActive: boolean; type: { not: string } } };
    };
    expect(call.where.category).toEqual({
      isRecurring: true,
      isActive: true,
      type: { not: "PAYROLL" },
    });
  });

  it("compara el mes pasado (jul) contra el mes actual (ago) con rangos UTC correctos", async () => {
    legalEntityMock.findMany.mockResolvedValue([{ id: "crt", code: "CRT" }]);
    expenseMock.findMany.mockResolvedValue([]);

    const { getMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    await getMissingRecurringExpenses(utc(2026, 7, 15)); // 15 agosto 2026

    const [thisMonthCall, prevMonthCall] = expenseMock.findMany.mock.calls as Array<[
      { where: { expenseDate: { gte: Date; lt: Date } } },
    ]>;
    expect(thisMonthCall![0].where.expenseDate).toEqual({
      gte: utc(2026, 7, 1),
      lt: utc(2026, 8, 1),
    });
    expect(prevMonthCall![0].where.expenseDate).toEqual({
      gte: utc(2026, 6, 1),
      lt: utc(2026, 7, 1),
    });
  });

  it("integra: detecta CFE de CRT faltante este mes", async () => {
    legalEntityMock.findMany.mockResolvedValue([
      { id: "crt", code: "CRT" },
      { id: "tsr", code: "TSR" },
    ]);
    expenseMock.findMany.mockImplementation(({ where }: { where: { expenseDate: { gte: Date } } }) => {
      // Primera llamada = mes actual (ago) → nada capturado todavía.
      // Segunda llamada = mes pasado (jul) → CFE de CRT sí se pagó.
      const isPrevMonth = where.expenseDate.gte.getTime() === utc(2026, 6, 1).getTime();
      if (isPrevMonth) {
        return Promise.resolve([
          { legalEntityId: "crt", categoryId: "cfe", category: { name: "CFE" } },
        ]);
      }
      return Promise.resolve([]);
    });

    const { getMissingRecurringExpenses } = await import(
      "@/server/services/expenses-queries"
    );
    const missing = await getMissingRecurringExpenses(utc(2026, 7, 15));

    expect(missing).toEqual([
      { legalEntityId: "crt", legalEntityCode: "CRT", categoryId: "cfe", categoryName: "CFE" },
    ]);
  });
});
