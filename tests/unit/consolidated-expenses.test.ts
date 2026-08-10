import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const expenseMock = { findMany: vi.fn() };
const payrollMock = { findMany: vi.fn() };
const cadastralPaymentMock = { findMany: vi.fn() };
const loanPaymentMock = { findMany: vi.fn() };

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    expense: expenseMock,
    payroll: payrollMock,
    cadastralPayment: cadastralPaymentMock,
    loanPayment: loanPaymentMock,
  },
}));

const TENANT = "tenant-1";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const D = (n: number) => new Prisma.Decimal(n);

beforeEach(() => {
  vi.clearAllMocks();
  expenseMock.findMany.mockResolvedValue([]);
  payrollMock.findMany.mockResolvedValue([]);
  cadastralPaymentMock.findMany.mockResolvedValue([]);
  loanPaymentMock.findMany.mockResolvedValue([]);
});

describe("getOperatingExpenseRows", () => {
  it("incluye gastos de Expense con su categoría real", async () => {
    expenseMock.findMany.mockResolvedValue([
      {
        id: "e1",
        amount: D(1500),
        expenseDate: utc(2026, 3, 10),
        legalEntityId: "crt",
        categoryId: "cat-cfe",
        category: { name: "CFE" },
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "expense:e1",
      legalEntityId: "crt",
      categoryKey: "cat-cat-cfe",
      categoryLabel: "CFE",
    });
    expect(rows[0]!.amount.toString()).toBe("1500");
  });

  it("excluye categorías tipo PAYROLL de la tabla Expense (se leen desde Payroll)", async () => {
    await import("@/lib/services/consolidated-expenses").then((m) =>
      m.getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1)),
    );
    const call = expenseMock.findMany.mock.calls[0]?.[0] as {
      where: { category: { type: { not: string } } };
    };
    expect(call.where.category.type.not).toBe("PAYROLL");
  });

  it("incluye Payroll con su label traducido, excluyendo STRATEGY_NOMINA en la query", async () => {
    payrollMock.findMany.mockResolvedValue([
      {
        id: "p1",
        amount: D(50000),
        period: utc(2026, 5, 1),
        type: "DIRECT_PAYROLL",
        legalEntityId: "crt",
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));

    expect(rows[0]).toMatchObject({
      id: "payroll:p1",
      categoryKey: "payroll-DIRECT_PAYROLL",
      categoryLabel: "Nómina Directa",
    });
    const call = payrollMock.findMany.mock.calls[0]?.[0] as {
      where: { type: { not: string } };
    };
    expect(call.where.type.not).toBe("STRATEGY_NOMINA");
  });

  it("usa el type crudo como label si no hay traducción conocida", async () => {
    payrollMock.findMany.mockResolvedValue([
      { id: "p2", amount: D(1000), period: utc(2026, 5, 1), type: "WEIRD_TYPE", legalEntityId: "crt" },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));
    expect(rows[0]!.categoryLabel).toBe("WEIRD_TYPE");
  });

  it("imputa predial a paymentDate/paidAmount cuando existen", async () => {
    cadastralPaymentMock.findMany.mockResolvedValue([
      {
        id: "cp1",
        paidAmount: D(8000),
        totalAmount: D(10000),
        paymentDate: utc(2026, 2, 15),
        dueDate: utc(2026, 1, 1),
        payerEntityId: null,
        property: { managerEntityId: "crt" },
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));

    expect(rows[0]).toMatchObject({
      id: "predial:cp1",
      legalEntityId: "crt",
      categoryKey: "predial",
      categoryLabel: "Predial Impuestos",
    });
    expect(rows[0]!.amount.toString()).toBe("8000");
    expect(rows[0]!.date.getTime()).toBe(utc(2026, 2, 15).getTime());
  });

  it("cae a dueDate/totalAmount cuando el predial aún no se paga", async () => {
    cadastralPaymentMock.findMany.mockResolvedValue([
      {
        id: "cp2",
        paidAmount: null,
        totalAmount: D(12000),
        paymentDate: null,
        dueDate: utc(2026, 3, 1),
        payerEntityId: null,
        property: { managerEntityId: "crt" },
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));
    expect(rows[0]!.amount.toString()).toBe("12000");
    expect(rows[0]!.date.getTime()).toBe(utc(2026, 3, 1).getTime());
  });

  it("usa payerEntityId sobre managerEntityId cuando un tercero paga el predial", async () => {
    cadastralPaymentMock.findMany.mockResolvedValue([
      {
        id: "cp3",
        paidAmount: D(5000),
        totalAmount: D(5000),
        paymentDate: utc(2026, 2, 1),
        dueDate: utc(2026, 1, 1),
        payerEntityId: "tsr",
        property: { managerEntityId: "crt" },
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));
    expect(rows[0]!.legalEntityId).toBe("tsr");
  });

  it("descarta predial sin monto (ni paidAmount ni totalAmount)", async () => {
    cadastralPaymentMock.findMany.mockResolvedValue([
      {
        id: "cp4",
        paidAmount: null,
        totalAmount: null,
        paymentDate: null,
        dueDate: utc(2026, 3, 1),
        payerEntityId: null,
        property: { managerEntityId: "crt" },
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));
    expect(rows).toHaveLength(0);
  });

  it("incluye LoanPayment filtrando VEHICLE ya en la query, con sublabel VEHICLE", async () => {
    loanPaymentMock.findMany.mockResolvedValue([
      {
        id: "lp1",
        amount: D(9000),
        period: utc(2026, 4, 1),
        loan: { id: "loan-1", name: "Toyota Hilux", legalEntityId: "crt" },
      },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));

    expect(rows[0]).toMatchObject({
      id: "loan:lp1",
      categoryKey: "loan-loan-1",
      categoryLabel: "Financiamiento Toyota Hilux",
      categorySublabel: "VEHICLE",
    });
    const call = loanPaymentMock.findMany.mock.calls[0]?.[0] as {
      where: { loan: { type: string } };
    };
    expect(call.where.loan.type).toBe("VEHICLE");
  });

  it("consolida las 4 fuentes en una sola lista", async () => {
    expenseMock.findMany.mockResolvedValue([
      { id: "e1", amount: D(100), expenseDate: utc(2026, 0, 5), legalEntityId: "crt", categoryId: "c1", category: { name: "CFE" } },
    ]);
    payrollMock.findMany.mockResolvedValue([
      { id: "p1", amount: D(200), period: utc(2026, 0, 1), type: "DIRECT_PAYROLL", legalEntityId: "crt" },
    ]);
    cadastralPaymentMock.findMany.mockResolvedValue([
      { id: "cp1", paidAmount: D(300), totalAmount: D(300), paymentDate: utc(2026, 0, 10), dueDate: utc(2025, 11, 1), payerEntityId: null, property: { managerEntityId: "crt" } },
    ]);
    loanPaymentMock.findMany.mockResolvedValue([
      { id: "lp1", amount: D(400), period: utc(2026, 0, 1), loan: { id: "loan-1", name: "Hilux", legalEntityId: "crt" } },
    ]);
    const { getOperatingExpenseRows } = await import("@/lib/services/consolidated-expenses");
    const rows = await getOperatingExpenseRows(TENANT, utc(2026, 0, 1), utc(2027, 0, 1));

    expect(rows).toHaveLength(4);
    const total = rows.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
    expect(total.toString()).toBe("1000");
  });
});
