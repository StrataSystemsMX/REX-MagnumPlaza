import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();

const expenseMock = {
  create: vi.fn(),
  updateMany: vi.fn(),
  findFirstOrThrow: vi.fn(),
  deleteMany: vi.fn(),
};
const legalEntityMock = { findFirstOrThrow: vi.fn() };
const expenseCategoryMock = { findFirstOrThrow: vi.fn() };
const propertyMock = { findFirstOrThrow: vi.fn() };
const auditLogMock = { create: vi.fn() };

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
vi.mock("@/lib/auth/get-session", () => ({
  requireAuth: () => mockRequireAuth(),
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return {
    ...actual,
    requirePermission: (...args: [string, string]) => mockRequirePermission(...args),
  };
});
vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    expense: expenseMock,
    legalEntity: legalEntityMock,
    expenseCategory: expenseCategoryMock,
    property: propertyMock,
    auditLog: auditLogMock,
  },
  prismaUnsafe: {},
}));

const TENANT = "tenant-1";
const USER = "user-1";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

const VALID_CREATE = {
  legalEntityId: "entity-1",
  categoryId: "cat-1",
  amount: 5000,
  expenseDate: utc(2026, 4, 15),
  description: "CFE mayo",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    userId: "clerk_1",
    tenantId: TENANT,
    user: {},
    dbUser: { id: USER, tenantId: TENANT },
  });
  mockRequirePermission.mockResolvedValue(undefined);
  legalEntityMock.findFirstOrThrow.mockResolvedValue({ id: "entity-1" });
  expenseCategoryMock.findFirstOrThrow.mockResolvedValue({ id: "cat-1" });
  propertyMock.findFirstOrThrow.mockResolvedValue({ id: "prop-1" });
});

// ============================================================================
// actionCreateExpense
// ============================================================================

describe("actionCreateExpense", () => {
  it("crea egreso con los datos correctos y escribe AuditLog", async () => {
    expenseMock.create.mockResolvedValue({ id: "expense-1" });

    const { actionCreateExpense } = await import("@/lib/services/expenses");
    const result = await actionCreateExpense(VALID_CREATE);

    expect(result).toEqual({ id: "expense-1" });

    const createArg = expenseMock.create.mock.calls[0]?.[0] as {
      data: {
        tenantId: string;
        amount: Prisma.Decimal;
        legalEntityId: string;
        isPaid: boolean;
      };
    };
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.amount.toString()).toBe("5000");
    expect(createArg.data.legalEntityId).toBe("entity-1");
    expect(createArg.data.isPaid).toBe(true);

    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("Expense");
  });

  it("valida propertyId cuando se proporciona", async () => {
    expenseMock.create.mockResolvedValue({ id: "expense-1" });

    const { actionCreateExpense } = await import("@/lib/services/expenses");
    await actionCreateExpense({ ...VALID_CREATE, propertyId: "prop-1" });

    expect(propertyMock.findFirstOrThrow).toHaveBeenCalledOnce();
    const arg = propertyMock.findFirstOrThrow.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(arg.where).toEqual({ id: "prop-1", tenantId: TENANT });
  });

  it("falla si la razón social no existe en el tenant", async () => {
    legalEntityMock.findFirstOrThrow.mockRejectedValue(new Error("Not found"));

    const { actionCreateExpense } = await import("@/lib/services/expenses");
    await expect(actionCreateExpense(VALID_CREATE)).rejects.toThrow();
    expect(expenseMock.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionUpdateExpense
// ============================================================================

describe("actionUpdateExpense", () => {
  it("actualiza el egreso cuando pertenece al tenant", async () => {
    expenseMock.updateMany.mockResolvedValue({ count: 1 });

    const { actionUpdateExpense } = await import("@/lib/services/expenses");
    await actionUpdateExpense({
      id: "expense-1",
      legalEntityId: "entity-1",
      categoryId: "cat-1",
      amount: 6000,
      expenseDate: utc(2026, 4, 15),
      description: "CFE mayo actualizado",
      isPaid: true,
    });

    const updateArg = expenseMock.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
      data: { amount: Prisma.Decimal };
    };
    expect(updateArg.where).toEqual({ id: "expense-1", tenantId: TENANT });
    expect(updateArg.data.amount.toString()).toBe("6000");
  });

  it("falla si el egreso no pertenece al tenant (count=0)", async () => {
    expenseMock.updateMany.mockResolvedValue({ count: 0 });

    const { actionUpdateExpense } = await import("@/lib/services/expenses");
    await expect(
      actionUpdateExpense({
        id: "expense-x",
        legalEntityId: "entity-1",
        categoryId: "cat-1",
        amount: 100,
        expenseDate: utc(2026, 4, 15),
        description: "Inexistente",
        isPaid: false,
      }),
    ).rejects.toThrow(/no encontrado/i);
  });
});

// ============================================================================
// actionRegisterExpense (marcar como pagado)
// ============================================================================

describe("actionRegisterExpense", () => {
  it("marca el egreso como pagado y concatena notas sin sobrescribir", async () => {
    expenseMock.findFirstOrThrow.mockResolvedValue({
      id: "expense-1",
      notes: "Nota previa",
    });
    expenseMock.updateMany.mockResolvedValue({ count: 1 });

    const { actionRegisterExpense } = await import("@/lib/services/expenses");
    await actionRegisterExpense({
      id: "expense-1",
      amount: 5000,
      paymentMethod: "TRANSFER",
      notes: "Pagado el 15 mayo",
    });

    const updateArg = expenseMock.updateMany.mock.calls[0]?.[0] as {
      data: { isPaid: boolean; isNotRequired: boolean; notes: string };
    };
    expect(updateArg.data.isPaid).toBe(true);
    expect(updateArg.data.isNotRequired).toBe(false);
    expect(updateArg.data.notes).toBe("Nota previa\nPagado el 15 mayo");
  });

  it("funciona sin notas previas ni notas nuevas", async () => {
    expenseMock.findFirstOrThrow.mockResolvedValue({ id: "expense-1", notes: null });
    expenseMock.updateMany.mockResolvedValue({ count: 1 });

    const { actionRegisterExpense } = await import("@/lib/services/expenses");
    await actionRegisterExpense({ id: "expense-1", amount: 3000 });

    const updateArg = expenseMock.updateMany.mock.calls[0]?.[0] as {
      data: { isPaid: boolean; notes: null };
    };
    expect(updateArg.data.isPaid).toBe(true);
    expect(updateArg.data.notes).toBeNull();
  });
});

// ============================================================================
// actionToggleExpenseNotRequired
// ============================================================================

describe("actionToggleExpenseNotRequired", () => {
  it("marca como sin egreso y limpia isPaid", async () => {
    expenseMock.findFirstOrThrow.mockResolvedValue({ id: "expense-1", isNotRequired: false });
    expenseMock.updateMany.mockResolvedValue({ count: 1 });

    const { actionToggleExpenseNotRequired } = await import("@/lib/services/expenses");
    await actionToggleExpenseNotRequired({ id: "expense-1" });

    const updateArg = expenseMock.updateMany.mock.calls[0]?.[0] as {
      data: { isNotRequired: boolean; isPaid: boolean };
    };
    expect(updateArg.data.isNotRequired).toBe(true);
    expect(updateArg.data.isPaid).toBe(false);
  });

  it("desactiva el marcador de sin egreso (toggle off)", async () => {
    expenseMock.findFirstOrThrow.mockResolvedValue({ id: "expense-1", isNotRequired: true });
    expenseMock.updateMany.mockResolvedValue({ count: 1 });

    const { actionToggleExpenseNotRequired } = await import("@/lib/services/expenses");
    await actionToggleExpenseNotRequired({ id: "expense-1" });

    const updateArg = expenseMock.updateMany.mock.calls[0]?.[0] as {
      data: { isNotRequired: boolean };
    };
    expect(updateArg.data.isNotRequired).toBe(false);
    // No debe limpiar isPaid cuando se desmarca
    expect(updateArg.data).not.toHaveProperty("isPaid");
  });
});

// ============================================================================
// actionDeleteExpense
// ============================================================================

describe("actionDeleteExpense", () => {
  it("elimina el egreso y escribe AuditLog DELETE", async () => {
    expenseMock.deleteMany.mockResolvedValue({ count: 1 });

    const { actionDeleteExpense } = await import("@/lib/services/expenses");
    await actionDeleteExpense({ id: "expense-1" });

    const deleteArg = expenseMock.deleteMany.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(deleteArg.where).toEqual({ id: "expense-1", tenantId: TENANT });

    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditArg.data.action).toBe("DELETE");
  });

  it("falla si el egreso no existe en el tenant", async () => {
    expenseMock.deleteMany.mockResolvedValue({ count: 0 });

    const { actionDeleteExpense } = await import("@/lib/services/expenses");
    await expect(actionDeleteExpense({ id: "expense-x" })).rejects.toThrow(/no encontrado/i);
  });
});
