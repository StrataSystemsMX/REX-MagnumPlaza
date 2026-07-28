import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();

const maintenanceMock = {
  create: vi.fn(),
  findFirstOrThrow: vi.fn(),
  update: vi.fn(),
};
const propertyMock = { findFirstOrThrow: vi.fn() };
const expenseMock = { create: vi.fn() };
const expenseCategoryMock = { findFirst: vi.fn() };
const unitMock = { findFirst: vi.fn() };
const auditLogMock = { create: vi.fn() };

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  revalidateTag: vi.fn(),
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
    maintenance: maintenanceMock,
    property: propertyMock,
    expense: expenseMock,
    expenseCategory: expenseCategoryMock,
    unit: unitMock,
    auditLog: auditLogMock,
  },
  prismaUnsafe: {},
}));

const TENANT = "tenant-1";
const USER = "user-1";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    userId: "clerk_1",
    tenantId: TENANT,
    user: {},
    dbUser: { id: USER, tenantId: TENANT },
  });
  mockRequirePermission.mockResolvedValue(undefined);
  propertyMock.findFirstOrThrow.mockResolvedValue({
    id: "prop-1",
    name: "Plaza Progreso",
    managerEntityId: "entity-1",
  });
  maintenanceMock.create.mockResolvedValue({ id: "maint-1" });
});

// ============================================================================
// actionCreateMaintenance
// ============================================================================

describe("actionCreateMaintenance", () => {
  it("crea mantenimiento sin costo — no crea egreso", async () => {
    const { actionCreateMaintenance } = await import("@/lib/services/maintenances");
    const result = await actionCreateMaintenance({
      propertyId: "prop-1",
      title: "Revisión eléctrica",
      type: "PREVENTIVE",
      responsibility: "OWNER",
      isRecurring: false,
      scheduledDate: undefined,
      cost: undefined,
    });

    expect(result).toMatchObject({ id: "maint-1" });
    expect(expenseMock.create).not.toHaveBeenCalled();

    const createArg = maintenanceMock.create.mock.calls[0]?.[0] as {
      data: { status: string; tenantId: string };
    };
    expect(createArg.data.status).toBe("PLANNED");
    expect(createArg.data.tenantId).toBe(TENANT);
  });

  it("crea mantenimiento con costo → auto-crea egreso ligado", async () => {
    expenseCategoryMock.findFirst.mockResolvedValue({ id: "cat-mant" });
    expenseMock.create.mockResolvedValue({ id: "expense-auto-1" });

    const { actionCreateMaintenance } = await import("@/lib/services/maintenances");
    await actionCreateMaintenance({
      propertyId: "prop-1",
      title: "Cambio de vidrio",
      type: "CORRECTIVE",
      responsibility: "OWNER",
      isRecurring: false,
      cost: 3500,
      scheduledDate: utc(2026, 4, 20),
    });

    expect(expenseMock.create).toHaveBeenCalledOnce();
    const expenseArg = expenseMock.create.mock.calls[0]?.[0] as {
      data: {
        tenantId: string;
        legalEntityId: string;
        amount: Prisma.Decimal;
        isPaid: boolean;
        notes: string;
        propertyId: string;
      };
    };
    expect(expenseArg.data.tenantId).toBe(TENANT);
    expect(expenseArg.data.legalEntityId).toBe("entity-1");
    expect(expenseArg.data.amount.toString()).toBe("3500");
    expect(expenseArg.data.isPaid).toBe(false);
    expect(expenseArg.data.notes).toContain("[maintenance:maint-1]");
    expect(expenseArg.data.propertyId).toBe("prop-1");
  });

  it("con costo pero sin categoría MANTENIMIENTO_PLAZAS — no crea egreso", async () => {
    expenseCategoryMock.findFirst.mockResolvedValue(null);

    const { actionCreateMaintenance } = await import("@/lib/services/maintenances");
    await actionCreateMaintenance({
      propertyId: "prop-1",
      title: "Pintura",
      type: "PREVENTIVE",
      responsibility: "OWNER",
      isRecurring: false,
      cost: 2000,
      scheduledDate: undefined,
    });

    expect(expenseMock.create).not.toHaveBeenCalled();
  });

  it("incluye código de unidad en la descripción del egreso", async () => {
    expenseCategoryMock.findFirst.mockResolvedValue({ id: "cat-mant" });
    unitMock.findFirst.mockResolvedValue({ code: "L7" });
    expenseMock.create.mockResolvedValue({ id: "expense-auto-1" });

    const { actionCreateMaintenance } = await import("@/lib/services/maintenances");
    await actionCreateMaintenance({
      propertyId: "prop-1",
      unitId: "unit-7",
      title: "Plomería",
      type: "CORRECTIVE",
      responsibility: "LESSEE",
      isRecurring: false,
      cost: 1200,
      scheduledDate: undefined,
    });

    const expenseArg = expenseMock.create.mock.calls[0]?.[0] as {
      data: { description: string };
    };
    expect(expenseArg.data.description).toContain("L7");
  });

  it("falla si la propiedad no pertenece al tenant", async () => {
    propertyMock.findFirstOrThrow.mockRejectedValue(new Error("Not found"));

    const { actionCreateMaintenance } = await import("@/lib/services/maintenances");
    await expect(
      actionCreateMaintenance({
        propertyId: "prop-x",
        title: "Test",
        type: "PREVENTIVE",
        responsibility: "OWNER",
        isRecurring: false,
        scheduledDate: undefined,
        cost: undefined,
      }),
    ).rejects.toThrow();
    expect(maintenanceMock.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionUpdateMaintenanceStatus
// ============================================================================

describe("actionUpdateMaintenanceStatus", () => {
  it("PLANNED → IN_PROGRESS actualiza status sin completedDate", async () => {
    maintenanceMock.findFirstOrThrow.mockResolvedValue({
      id: "maint-1",
      status: "PLANNED",
    });
    maintenanceMock.update.mockResolvedValue({ id: "maint-1", status: "IN_PROGRESS" });

    const { actionUpdateMaintenanceStatus } = await import("@/lib/services/maintenances");
    await actionUpdateMaintenanceStatus({
      maintenanceId: "maint-1",
      status: "IN_PROGRESS",
      completedDate: undefined,
      cost: undefined,
    });

    const updateArg = maintenanceMock.update.mock.calls[0]?.[0] as {
      data: { status: string; completedDate?: Date };
    };
    expect(updateArg.data.status).toBe("IN_PROGRESS");
    expect(updateArg.data.completedDate).toBeUndefined();
  });

  it("→ COMPLETED agrega completedDate automáticamente", async () => {
    maintenanceMock.findFirstOrThrow.mockResolvedValue({
      id: "maint-1",
      status: "IN_PROGRESS",
    });
    maintenanceMock.update.mockResolvedValue({ id: "maint-1", status: "COMPLETED" });

    const { actionUpdateMaintenanceStatus } = await import("@/lib/services/maintenances");
    await actionUpdateMaintenanceStatus({
      maintenanceId: "maint-1",
      status: "COMPLETED",
      completedDate: undefined,
      cost: undefined,
    });

    const updateArg = maintenanceMock.update.mock.calls[0]?.[0] as {
      data: { status: string; completedDate: Date };
    };
    expect(updateArg.data.status).toBe("COMPLETED");
    expect(updateArg.data.completedDate).toBeInstanceOf(Date);
  });

  it("acepta completedDate explícita al completar", async () => {
    maintenanceMock.findFirstOrThrow.mockResolvedValue({
      id: "maint-1",
      status: "IN_PROGRESS",
    });
    maintenanceMock.update.mockResolvedValue({ id: "maint-1" });
    const explicitDate = utc(2026, 5, 30);

    const { actionUpdateMaintenanceStatus } = await import("@/lib/services/maintenances");
    await actionUpdateMaintenanceStatus({
      maintenanceId: "maint-1",
      status: "COMPLETED",
      completedDate: explicitDate,
      cost: undefined,
    });

    const updateArg = maintenanceMock.update.mock.calls[0]?.[0] as {
      data: { completedDate: Date };
    };
    expect(updateArg.data.completedDate).toEqual(explicitDate);
  });
});
