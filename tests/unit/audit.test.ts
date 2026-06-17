import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditCategoryLabel,
  categoryOf,
  entityTypeLabel,
  entityTypesForCategory,
  isReversible,
  reversibilityOf,
} from "@/lib/audit/categories";

// ============================================================================
// Mocks para actionUndoChange
// ============================================================================

const mockRequireAuth = vi.fn();
const mockRequireAuditRestore = vi.fn();
const mockRevalidatePath = vi.fn();

const auditLogMock = { findFirst: vi.fn(), create: vi.fn() };
const lesseeMock = { updateMany: vi.fn() };
const propertyMock = { updateMany: vi.fn() };
const unitMock = { updateMany: vi.fn() };

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
    requireAuditRestore: (...args: [string]) => mockRequireAuditRestore(...args),
  };
});
vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    auditLog: auditLogMock,
    lessee: lesseeMock,
    property: propertyMock,
    unit: unitMock,
  },
  prismaUnsafe: {},
}));

const TENANT = "tenant-1";
const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    userId: "clerk_1",
    tenantId: TENANT,
    user: {},
    dbUser: { id: USER, tenantId: TENANT },
  });
  mockRequireAuditRestore.mockResolvedValue(undefined);
});

// ============================================================================
// Categorías
// ============================================================================

describe("categoryOf / entityTypesForCategory", () => {
  it("mapea cada entityType a su categoría de negocio", () => {
    expect(categoryOf("Payment")).toBe("INGRESOS");
    expect(categoryOf("Rent")).toBe("INGRESOS");
    expect(categoryOf("Expense")).toBe("EGRESOS");
    expect(categoryOf("Payroll")).toBe("EGRESOS");
    expect(categoryOf("CadastralPayment")).toBe("EGRESOS");
    expect(categoryOf("Lessee")).toBe("INQUILINOS");
    expect(categoryOf("Contract")).toBe("CONTRATOS");
    expect(categoryOf("Property")).toBe("INMUEBLES");
    expect(categoryOf("Unit")).toBe("INMUEBLES");
    expect(categoryOf("Maintenance")).toBe("MANTENIMIENTO");
  });

  it("cae en OTROS para entityTypes desconocidos", () => {
    expect(categoryOf("Algo")).toBe("OTROS");
  });

  it("entityTypesForCategory es el inverso del mapa", () => {
    expect(entityTypesForCategory("INGRESOS").sort()).toEqual(["Payment", "Rent"]);
    expect(entityTypesForCategory("INQUILINOS")).toEqual(["Lessee"]);
    expect(entityTypesForCategory("EGRESOS")).toContain("CadastralPayment");
  });

  it("traduce etiquetas al español", () => {
    expect(auditCategoryLabel("EGRESOS")).toBe("Egresos");
    expect(entityTypeLabel("Lessee")).toBe("Inquilino");
    expect(entityTypeLabel("CadastralPayment")).toBe("Predial");
  });
});

// ============================================================================
// Reversibilidad
// ============================================================================

describe("reversibilityOf", () => {
  it("permite restaurar el borrado lógico de Inquilino/Inmueble/Unidad", () => {
    for (const entityType of ["Lessee", "Property", "Unit"]) {
      expect(
        isReversible({ action: "DELETE", entityType, changes: { soft: true } }),
      ).toBe(true);
    }
  });

  it("no permite restaurar borrados permanentes (otras entidades)", () => {
    const rev = reversibilityOf({
      action: "DELETE",
      entityType: "Payroll",
      changes: { soft: true },
    });
    expect(rev.reversible).toBe(false);
    if (!rev.reversible) expect(rev.reason).toMatch(/permanente/i);
  });

  it("no permite deshacer un DELETE sin marca soft", () => {
    expect(
      isReversible({ action: "DELETE", entityType: "Lessee", changes: null }),
    ).toBe(false);
    expect(
      isReversible({ action: "DELETE", entityType: "Lessee", changes: {} }),
    ).toBe(false);
  });

  it("no permite deshacer creaciones, ediciones ni restauraciones", () => {
    expect(
      isReversible({ action: "CREATE", entityType: "Lessee", changes: { after: {} } }),
    ).toBe(false);
    expect(
      isReversible({ action: "UPDATE", entityType: "Lessee", changes: { after: {} } }),
    ).toBe(false);
    expect(
      isReversible({ action: "RESTORE", entityType: "Lessee", changes: {} }),
    ).toBe(false);
  });
});

// ============================================================================
// actionUndoChange (guard de servidor)
// ============================================================================

describe("actionUndoChange", () => {
  it("restaura un inquilino con borrado lógico y registra un RESTORE", async () => {
    auditLogMock.findFirst.mockResolvedValue({
      id: "log-1",
      action: "DELETE",
      entityType: "Lessee",
      entityId: "lessee-1",
      changes: { soft: true },
    });
    lesseeMock.updateMany.mockResolvedValue({ count: 1 });
    auditLogMock.create.mockResolvedValue({});

    const { actionUndoChange } = await import("@/lib/services/audit-actions");
    await actionUndoChange("log-1");

    expect(lesseeMock.updateMany).toHaveBeenCalledWith({
      where: { id: "lessee-1", tenantId: TENANT },
      data: { isActive: true },
    });
    const createArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(createArg.data.action).toBe("RESTORE");
    expect(createArg.data.entityType).toBe("Lessee");
    expect(createArg.data.entityId).toBe("lessee-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/historial");
  });

  it("rechaza deshacer un cambio no reversible (egreso eliminado)", async () => {
    auditLogMock.findFirst.mockResolvedValue({
      id: "log-2",
      action: "DELETE",
      entityType: "Expense",
      entityId: "exp-1",
      changes: { soft: true },
    });

    const { actionUndoChange } = await import("@/lib/services/audit-actions");
    await expect(actionUndoChange("log-2")).rejects.toThrow(/permanente/i);
    expect(lesseeMock.updateMany).not.toHaveBeenCalled();
    expect(auditLogMock.create).not.toHaveBeenCalled();
  });

  it("falla si el movimiento no existe en el tenant", async () => {
    auditLogMock.findFirst.mockResolvedValue(null);

    const { actionUndoChange } = await import("@/lib/services/audit-actions");
    await expect(actionUndoChange("missing")).rejects.toThrow(/no encontrado/i);
    expect(lesseeMock.updateMany).not.toHaveBeenCalled();
  });

  it("no escribe RESTORE si el registro ya no existe", async () => {
    auditLogMock.findFirst.mockResolvedValue({
      id: "log-3",
      action: "DELETE",
      entityType: "Lessee",
      entityId: "lessee-x",
      changes: { soft: true },
    });
    lesseeMock.updateMany.mockResolvedValue({ count: 0 });

    const { actionUndoChange } = await import("@/lib/services/audit-actions");
    await expect(actionUndoChange("log-3")).rejects.toThrow();
    expect(auditLogMock.create).not.toHaveBeenCalled();
  });
});
