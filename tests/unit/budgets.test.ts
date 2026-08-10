import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();

const budgetMock = {
  create: vi.fn(),
  createMany: vi.fn(),
  findFirstOrThrow: vi.fn(),
  findMany: vi.fn(),
};
const budgetLineMock = {
  create: vi.fn(),
  update: vi.fn(),
  findFirstOrThrow: vi.fn(),
  deleteMany: vi.fn(),
};
const legalEntityMock = { findFirstOrThrow: vi.fn(), findMany: vi.fn() };
const propertyMock = { findFirstOrThrow: vi.fn() };
const auditLogMock = { create: vi.fn() };

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
vi.mock("@/server/auth/get-session", () => ({
  requireAuth: () => mockRequireAuth(),
}));
vi.mock("@/server/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/permissions")>(
    "@/server/auth/permissions",
  );
  return {
    ...actual,
    requirePermission: (...args: [string, string]) => mockRequirePermission(...args),
  };
});
vi.mock("@/server/prisma/client", () => ({
  prisma: {
    budget: budgetMock,
    budgetLine: budgetLineMock,
    legalEntity: legalEntityMock,
    property: propertyMock,
    auditLog: auditLogMock,
  },
  prismaUnsafe: {},
}));

const TENANT = "tenant-1";
const USER = "user-1";

const ALL_MONTHS = {
  jan: 10000, feb: 10000, mar: 10000, apr: 10000,
  may: 10000, jun: 10000, jul: 10000, aug: 10000,
  sep: 10000, oct: 10000, nov: 10000, dec: 10000,
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
});

// ============================================================================
// actionCreateBudget
// ============================================================================

describe("actionCreateBudget", () => {
  it("crea presupuesto para una entidad y año", async () => {
    legalEntityMock.findFirstOrThrow.mockResolvedValue({ id: "entity-1" });
    budgetMock.create.mockResolvedValue({ id: "budget-1", year: 2026 });

    const { actionCreateBudget } = await import("@/server/services/budgets");
    const result = await actionCreateBudget({ legalEntityId: "entity-1", year: 2026 });

    expect(result).toMatchObject({ id: "budget-1", year: 2026 });
    const createArg = budgetMock.create.mock.calls[0]?.[0] as {
      data: { tenantId: string; legalEntityId: string; year: number };
    };
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.legalEntityId).toBe("entity-1");
    expect(createArg.data.year).toBe(2026);
  });

  it("falla si la entidad no está activa en el tenant", async () => {
    legalEntityMock.findFirstOrThrow.mockRejectedValue(new Error("Not found"));

    const { actionCreateBudget } = await import("@/server/services/budgets");
    await expect(actionCreateBudget({ legalEntityId: "entity-x", year: 2026 })).rejects.toThrow();
    expect(budgetMock.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionCreateBudgetsBatch
// ============================================================================

describe("actionCreateBudgetsBatch", () => {
  it("crea presupuestos sólo para entidades sin uno existente", async () => {
    legalEntityMock.findMany.mockResolvedValue([
      { id: "entity-1" },
      { id: "entity-2" },
      { id: "entity-3" },
    ]);
    // entity-1 ya tiene presupuesto 2026
    budgetMock.findMany.mockResolvedValue([{ legalEntityId: "entity-1" }]);
    budgetMock.createMany.mockResolvedValue({ count: 2 });

    const { actionCreateBudgetsBatch } = await import("@/server/services/budgets");
    const result = await actionCreateBudgetsBatch({
      legalEntityIds: ["entity-1", "entity-2", "entity-3"],
      year: 2026,
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);

    const createManyArg = budgetMock.createMany.mock.calls[0]?.[0] as {
      data: Array<{ legalEntityId: string }>;
    };
    const createdIds = createManyArg.data.map((d) => d.legalEntityId);
    expect(createdIds).not.toContain("entity-1");
    expect(createdIds).toContain("entity-2");
    expect(createdIds).toContain("entity-3");
  });

  it("no llama createMany si todos ya tienen presupuesto", async () => {
    legalEntityMock.findMany.mockResolvedValue([{ id: "entity-1" }]);
    budgetMock.findMany.mockResolvedValue([{ legalEntityId: "entity-1" }]);

    const { actionCreateBudgetsBatch } = await import("@/server/services/budgets");
    const result = await actionCreateBudgetsBatch({
      legalEntityIds: ["entity-1"],
      year: 2026,
    });

    expect(result.created).toBe(0);
    expect(budgetMock.createMany).not.toHaveBeenCalled();
  });

  it("falla si alguna entidad no es válida", async () => {
    // Devuelve menos entidades de las pedidas → entidad inválida
    legalEntityMock.findMany.mockResolvedValue([{ id: "entity-1" }]);
    budgetMock.findMany.mockResolvedValue([]);

    const { actionCreateBudgetsBatch } = await import("@/server/services/budgets");
    await expect(
      actionCreateBudgetsBatch({
        legalEntityIds: ["entity-1", "entity-invalid"],
        year: 2026,
      }),
    ).rejects.toThrow(/no son válidas/i);
    expect(budgetMock.createMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionUpsertBudgetLine
// ============================================================================

describe("actionUpsertBudgetLine", () => {
  it("crea línea de ingreso con propertyId cuando es INCOME_RENT", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    propertyMock.findFirstOrThrow.mockResolvedValue({ id: "prop-1" });
    budgetLineMock.create.mockResolvedValue({ id: "line-1" });

    const { actionUpsertBudgetLine } = await import("@/server/services/budgets");
    await actionUpsertBudgetLine({
      budgetId: "budget-1",
      conceptType: "INCOME_RENT",
      conceptLabel: "Renta Plaza Progreso",
      propertyId: "prop-1",
      months: ALL_MONTHS,
    });

    expect(budgetLineMock.create).toHaveBeenCalledOnce();
    const createArg = budgetLineMock.create.mock.calls[0]?.[0] as {
      data: { propertyId: string | null; conceptType: string };
    };
    expect(createArg.data.propertyId).toBe("prop-1");
    expect(createArg.data.conceptType).toBe("INCOME_RENT");
  });

  it("ignora propertyId en líneas de egreso (EXPENSE_*)", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    budgetLineMock.create.mockResolvedValue({ id: "line-1" });

    const { actionUpsertBudgetLine } = await import("@/server/services/budgets");
    await actionUpsertBudgetLine({
      budgetId: "budget-1",
      conceptType: "EXPENSE",
      conceptLabel: "CFE",
      propertyId: "prop-1", // debe ignorarse
      months: ALL_MONTHS,
    });

    const createArg = budgetLineMock.create.mock.calls[0]?.[0] as {
      data: { propertyId: null };
    };
    expect(createArg.data.propertyId).toBeNull();
    // No valida la propiedad para líneas de egreso
    expect(propertyMock.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("actualiza línea existente cuando se pasa lineId", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    budgetLineMock.findFirstOrThrow.mockResolvedValue({ id: "line-1" });
    budgetLineMock.update.mockResolvedValue({ id: "line-1" });

    const { actionUpsertBudgetLine } = await import("@/server/services/budgets");
    await actionUpsertBudgetLine({
      budgetId: "budget-1",
      lineId: "line-1",
      conceptType: "EXPENSE",
      conceptLabel: "CFE actualizado",
      propertyId: null,
      months: ALL_MONTHS,
    });

    expect(budgetLineMock.update).toHaveBeenCalledOnce();
    expect(budgetLineMock.create).not.toHaveBeenCalled();
    // Verifica pertenencia de la línea al budget/tenant antes de mutar (anti-IDOR).
    const guardArg = budgetLineMock.findFirstOrThrow.mock.calls[0]?.[0] as {
      where: { id: string; budget: { id: string; tenantId: string } };
    };
    expect(guardArg.where.budget).toEqual({ id: "budget-1", tenantId: TENANT });
  });

  it("rechaza lineId que no pertenece al budget (IDOR)", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    budgetLineMock.findFirstOrThrow.mockRejectedValue(new Error("Not found"));

    const { actionUpsertBudgetLine } = await import("@/server/services/budgets");
    await expect(
      actionUpsertBudgetLine({
        budgetId: "budget-1",
        lineId: "line-ajena",
        conceptType: "EXPENSE",
        conceptLabel: "CFE",
        propertyId: null,
        months: ALL_MONTHS,
      }),
    ).rejects.toThrow();
    expect(budgetLineMock.update).not.toHaveBeenCalled();
  });

  it("guarda los 12 meses como Decimals", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    budgetLineMock.create.mockResolvedValue({ id: "line-1" });

    const { actionUpsertBudgetLine } = await import("@/server/services/budgets");
    await actionUpsertBudgetLine({
      budgetId: "budget-1",
      conceptType: "EXPENSE",
      conceptLabel: "Otros",
      propertyId: null,
      months: ALL_MONTHS,
    });

    const createArg = budgetLineMock.create.mock.calls[0]?.[0] as {
      data: Record<string, Prisma.Decimal>;
    };
    expect(createArg.data["jan"]).toBeInstanceOf(Prisma.Decimal);
    expect(createArg.data["jan"]!.toString()).toBe("10000");
    expect(createArg.data["dec"]).toBeInstanceOf(Prisma.Decimal);
  });

  it("falla si el presupuesto está cerrado (isLocked=true)", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: true });

    const { actionUpsertBudgetLine } = await import("@/server/services/budgets");
    await expect(
      actionUpsertBudgetLine({
        budgetId: "budget-1",
        conceptType: "INCOME_RENT",
        conceptLabel: "Test",
        propertyId: null,
        months: ALL_MONTHS,
      }),
    ).rejects.toThrow(/cerrado/i);
    expect(budgetLineMock.create).not.toHaveBeenCalled();
    expect(budgetLineMock.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionDeleteBudgetLine
// ============================================================================

describe("actionDeleteBudgetLine", () => {
  it("elimina la línea acotando el where al budget del tenant (anti-IDOR)", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    budgetLineMock.deleteMany.mockResolvedValue({ count: 1 });

    const { actionDeleteBudgetLine } = await import("@/server/services/budgets");
    await actionDeleteBudgetLine("line-1", "budget-1");

    expect(budgetLineMock.deleteMany).toHaveBeenCalledOnce();
    const arg = budgetLineMock.deleteMany.mock.calls[0]?.[0] as {
      where: { id: string; budget: { id: string; tenantId: string } };
    };
    expect(arg.where.id).toBe("line-1");
    expect(arg.where.budget).toEqual({ id: "budget-1", tenantId: TENANT });
  });

  it("falla si la línea no pertenece al budget (count 0)", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: false });
    budgetLineMock.deleteMany.mockResolvedValue({ count: 0 });

    const { actionDeleteBudgetLine } = await import("@/server/services/budgets");
    await expect(actionDeleteBudgetLine("line-ajena", "budget-1")).rejects.toThrow(
      /no encontrada/i,
    );
  });

  it("falla si el presupuesto está cerrado", async () => {
    budgetMock.findFirstOrThrow.mockResolvedValue({ id: "budget-1", isLocked: true });

    const { actionDeleteBudgetLine } = await import("@/server/services/budgets");
    await expect(actionDeleteBudgetLine("line-1", "budget-1")).rejects.toThrow(/cerrado/i);
    expect(budgetLineMock.deleteMany).not.toHaveBeenCalled();
  });
});
