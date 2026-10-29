import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNDO_CAPABILITIES,
  auditCategoryLabel,
  categoryOf,
  entityTypeLabel,
  entityTypesForCategory,
  isReversible,
  reversibilityOf,
} from "@/shared/audit/categories";
import {
  coerceFields,
  serializeFields,
  DATE_KEYS,
} from "@/shared/audit/field-types";
import { describeAuditDetail } from "@/shared/audit/describe";

// ============================================================================
// Mocks (para audit-undo / audit-actions)
// ============================================================================

const mockRequireAuth = vi.fn();
const mockRequireAuditRestore = vi.fn();
const mockRevalidatePath = vi.fn();
const mockReconcile = vi.fn();

function model() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  };
}

const prismaMock = {
  auditLog: model(),
  lessee: model(),
  property: model(),
  unit: model(),
  contract: model(),
  rent: model(),
  payment: model(),
  guarantee: model(),
  document: model(),
  cadastralPayment: model(),
  maintenance: model(),
  $transaction: vi.fn(),
};

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
    requireAuditRestore: (...args: [string]) => mockRequireAuditRestore(...args),
  };
});
vi.mock("@/server/prisma/client", () => ({ prisma: prismaMock, prismaUnsafe: {} }));
vi.mock("@/server/services/rent-generation", () => ({
  reconcileRentsForContract: (...args: unknown[]) => mockReconcile(...args),
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
  mockReconcile.mockResolvedValue({});
  // $transaction corre el callback con el mismo mock como `tx`.
  prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
  for (const key of Object.keys(prismaMock) as (keyof typeof prismaMock)[]) {
    const m = prismaMock[key];
    if (m && typeof m === "object" && "deleteMany" in m) {
      m.deleteMany.mockResolvedValue({ count: 0 });
      m.updateMany.mockResolvedValue({ count: 1 });
      m.findMany.mockResolvedValue([]);
      m.count.mockResolvedValue(0);
      m.create.mockResolvedValue({});
    }
  }
});

// ============================================================================
// field-types
// ============================================================================

describe("serializeFields / coerceFields", () => {
  it("serializa Date→ISO, Decimal→string y solo las llaves pedidas", () => {
    const decimalLike = { toFixed: () => "5000.00", toString: () => "5000.00" };
    const row = {
      monthlyAmount: decimalLike,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      legalName: "Goyoma",
      ignored: "no",
    };
    const out = serializeFields(row, ["monthlyAmount", "startDate", "legalName"]);
    expect(out).toEqual({
      monthlyAmount: "5000.00",
      startDate: "2026-01-01T00:00:00.000Z",
      legalName: "Goyoma",
    });
    expect("ignored" in out).toBe(false);
  });

  it("serializa null/undefined como null", () => {
    expect(serializeFields({ a: null, b: undefined }, ["a", "b"])).toEqual({
      a: null,
      b: null,
    });
  });

  it("coerce regresa las fechas a Date y deja el dinero como string", () => {
    const out = coerceFields({ startDate: "2026-01-01T00:00:00.000Z", monthlyAmount: "5000.00" });
    expect(out.startDate).toBeInstanceOf(Date);
    expect(out.monthlyAmount).toBe("5000.00");
    expect(DATE_KEYS.has("startDate")).toBe(true);
  });
});

// ============================================================================
// Categorías
// ============================================================================

describe("categorías", () => {
  it("mapea entityType a categoría y etiqueta", () => {
    expect(categoryOf("Payment")).toBe("INGRESOS");
    expect(categoryOf("Lessee")).toBe("INQUILINOS");
    expect(categoryOf("Algo")).toBe("OTROS");
    expect(auditCategoryLabel("EGRESOS")).toBe("Egresos");
    expect(entityTypeLabel("Lessee")).toBe("Inquilino");
    expect(entityTypesForCategory("INGRESOS").sort()).toEqual(["Payment", "Rent"]);
  });
});

// ============================================================================
// describeAuditDetail (detalle legible del historial)
// ============================================================================

describe("describeAuditDetail", () => {
  it("Pago CREATE: incluye monto, método, fecha y estado de la renta", () => {
    const txt = describeAuditDetail({
      action: "CREATE",
      entityType: "Payment",
      changes: {
        rentId: "r1",
        amount: "2000",
        method: "CASH",
        paymentDate: "2026-06-10T00:00:00.000Z",
        rentStatusAfter: "PAID",
      },
    });
    expect(txt).toContain("Registró un pago");
    expect(txt).toContain("$2,000.00");
    expect(txt).toContain("efectivo");
    expect(txt).toContain("junio");
    expect(txt).toContain("Pagado");
  });

  it("Pago CREATE en cascada / bulk se distingue del pago normal", () => {
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "Payment",
        changes: { amount: "500", cascadedFrom: "r0" },
      }),
    ).toContain("adelanto");
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "Payment",
        changes: { amount: "500", bulk: true },
      }),
    ).toContain("agrupado");
  });

  it("Pago DELETE: incluye monto y fecha (antes decía solo 'Eliminó pago.')", () => {
    const txt = describeAuditDetail({
      action: "DELETE",
      entityType: "Payment",
      changes: { rentId: "r1", amount: "2000", paymentDate: "2026-07-15T00:00:00.000Z" },
    });
    expect(txt).toContain("Eliminó un pago");
    expect(txt).toContain("$2,000.00");
    expect(txt).toContain("julio");
  });

  it("Egreso CREATE/UPDATE: incluye monto y fecha", () => {
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "Expense",
        changes: { amount: 1500, expenseDate: "2026-06-01T00:00:00.000Z" },
      }),
    ).toBe("Creó un egreso de $1,500.00 con fecha 01 de junio de 2026.");
    expect(
      describeAuditDetail({
        action: "UPDATE",
        entityType: "Expense",
        changes: { amount: 1800, expenseDate: "2026-06-01T00:00:00.000Z" },
      }),
    ).toContain("Actualizó un egreso");
  });

  it("Egreso registrar pago: enriquece el marcador con monto y método", () => {
    const txt = describeAuditDetail({
      action: "UPDATE",
      entityType: "Expense",
      changes: { action: "REGISTER", amount: 900, paymentMethod: "TRANSFER" },
    });
    expect(txt).toContain("Registró el pago de egreso");
    expect(txt).toContain("$900.00");
    expect(txt).toContain("Transferencia");
  });

  it("Notificación: deduce el tipo de aviso y refleja el resultado del envío", () => {
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "NotificationLog",
        changes: { manual: false, paymentId: "p1", status: "SENT" },
      }),
    ).toBe("Envió la confirmación de pago.");
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "NotificationLog",
        changes: { manual: true, level: "2M", rentId: "r1", status: "SENT" },
      }),
    ).toBe("Envió el 2do aviso de mora (envío manual).");
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "NotificationLog",
        changes: { manual: true, contractId: "c1", status: "FAILED" },
      }),
    ).toBe("Falló el envío del aviso de contrato por vencer (envío manual).");
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "NotificationLog",
        changes: { manual: false, paymentId: "p1", status: "PENDING" },
      }),
    ).toContain("pendiente de envío");
  });

  it("Edición de pago sigue usando el bloque `after` genérico", () => {
    const txt = describeAuditDetail({
      action: "UPDATE",
      entityType: "Payment",
      changes: { before: { amount: "100" }, after: { amount: "150" } },
    });
    expect(txt).toContain("Actualizó pago");
    expect(txt).toContain("$150.00");
  });

  it("mantiene los detalles ricos ya existentes (inmueble, unidad)", () => {
    expect(
      describeAuditDetail({
        action: "UPDATE",
        entityType: "Property",
        changes: { after: { name: "Maria Escriba", notes: "algo" } },
      }),
    ).toBe("Actualizó inmueble: Nombre: Maria Escriba · Notas actualizadas.");
    expect(
      describeAuditDetail({
        action: "CREATE",
        entityType: "Unit",
        changes: { auto: true },
      }),
    ).toBe("Creó automáticamente unidad.");
  });
});

// ============================================================================
// Reversibilidad (nueva matriz por capacidades)
// ============================================================================

describe("reversibilityOf", () => {
  it("CREATE es reversible donde hay cascada", () => {
    expect(isReversible({ action: "CREATE", entityType: "Lessee", changes: { after: {} } })).toBe(true);
    expect(isReversible({ action: "CREATE", entityType: "Contract", changes: { after: {} } })).toBe(true);
    expect(isReversible({ action: "CREATE", entityType: "Payment", changes: { after: {} } })).toBe(true);
  });

  it("UPDATE es reversible solo si hay `before`", () => {
    expect(
      isReversible({ action: "UPDATE", entityType: "Lessee", changes: { before: { legalName: "A" }, after: {} } }),
    ).toBe(true);
    const sinBefore = reversibilityOf({ action: "UPDATE", entityType: "Lessee", changes: { after: {} } });
    expect(sinBefore.reversible).toBe(false);
    if (!sinBefore.reversible) expect(sinBefore.reason).toMatch(/previo/i);
  });

  it("UPDATE de Payment es reversible (corrección de pago con `before`)", () => {
    expect(
      isReversible({ action: "UPDATE", entityType: "Payment", changes: { before: { amount: "100" }, after: {} } }),
    ).toBe(true);
  });

  it("UPDATE no reversible si la entidad no soporta revert (Expense)", () => {
    expect(
      isReversible({ action: "UPDATE", entityType: "Expense", changes: { before: {}, after: {} } }),
    ).toBe(false);
  });

  it("DELETE reversible solo si es borrado lógico de un sujeto restaurable", () => {
    expect(isReversible({ action: "DELETE", entityType: "Lessee", changes: { soft: true } })).toBe(true);
    expect(isReversible({ action: "DELETE", entityType: "Lessee", changes: {} })).toBe(false);
    const contractDel = reversibilityOf({ action: "DELETE", entityType: "Contract", changes: { soft: true } });
    expect(contractDel.reversible).toBe(false);
    if (!contractDel.reversible) expect(contractDel.reason).toMatch(/permanente/i);
  });

  it("entidades sin capacidades y RESTORE no son reversibles", () => {
    expect(isReversible({ action: "UPDATE", entityType: "Expense", changes: { before: {}, after: {} } })).toBe(false);
    expect(isReversible({ action: "RESTORE", entityType: "Lessee", changes: {} })).toBe(false);
  });
});

// ============================================================================
// Capacidades ↔ handlers (deben mantenerse alineados)
// ============================================================================

describe("UNDO_CAPABILITIES ↔ UNDO_HANDLERS", () => {
  it("cada capacidad declarada tiene su handler implementado", async () => {
    const { UNDO_HANDLERS } = await import("@/server/services/audit-undo");
    for (const [entityType, caps] of Object.entries(UNDO_CAPABILITIES)) {
      const handler = UNDO_HANDLERS[entityType];
      expect(handler, `falta handler para ${entityType}`).toBeDefined();
      if (!handler) continue;
      if (caps.revert) expect(typeof handler.revert).toBe("function");
      if (caps.cascadeDelete) expect(typeof handler.cascadeDelete).toBe("function");
      if (caps.restore) expect(typeof handler.restore).toBe("function");
    }
  });
});

// ============================================================================
// Cascada de contrato (orden de borrado + liberar unidad)
// ============================================================================

describe("cascadeDelete Contract", () => {
  it("borra pagos→rentas→fianzas→docs→contrato y libera la unidad", async () => {
    const { UNDO_HANDLERS } = await import("@/server/services/audit-undo");
    const cascade = UNDO_HANDLERS.Contract?.cascadeDelete;
    if (!cascade) throw new Error("Contract.cascadeDelete no definido");
    prismaMock.contract.findFirst.mockResolvedValue({ unitId: "unit-1" });
    prismaMock.rent.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    prismaMock.contract.count.mockResolvedValue(0); // ningún otro contrato vigente

    await cascade(prismaMock as never, TENANT, "c1", new Date());

    expect(prismaMock.payment.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, rentId: { in: ["r1", "r2"] } },
    });
    expect(prismaMock.rent.deleteMany).toHaveBeenCalledWith({ where: { tenantId: TENANT, contractId: "c1" } });
    expect(prismaMock.guarantee.deleteMany).toHaveBeenCalled();
    expect(prismaMock.contract.deleteMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: TENANT } });
    expect(prismaMock.unit.updateMany).toHaveBeenCalledWith({
      where: { id: "unit-1", tenantId: TENANT },
      data: { status: "DISPONIBLE" },
    });
    // Orden: pagos antes que rentas.
    const payOrder = prismaMock.payment.deleteMany.mock.invocationCallOrder[0] ?? 0;
    const rentOrder = prismaMock.rent.deleteMany.mock.invocationCallOrder[0] ?? 0;
    expect(payOrder).toBeLessThan(rentOrder);
  });
});

// ============================================================================
// actionUndoChange (despacho + guardas)
// ============================================================================

function mkLog(over: Record<string, unknown>) {
  return {
    id: "log-1",
    action: "UPDATE",
    entityType: "Lessee",
    entityId: "l1",
    changes: {},
    createdAt: new Date("2026-06-17T00:00:00.000Z"),
    ...over,
  };
}

describe("actionUndoChange", () => {
  it("revierte una edición restaurando `before` y registra RESTORE", async () => {
    prismaMock.auditLog.findFirst
      .mockResolvedValueOnce(mkLog({ action: "UPDATE", changes: { before: { legalName: "Antes" }, after: { legalName: "Después" } } }))
      .mockResolvedValueOnce(null); // sin cambios más recientes

    const { actionUndoChange } = await import("@/server/services/audit-actions");
    await actionUndoChange("log-1");

    expect(prismaMock.lessee.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", tenantId: TENANT },
      data: { legalName: "Antes" },
    });
    const createArg = prismaMock.auditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
    expect(createArg.data.action).toBe("RESTORE");
  });

  it("deshace una creación borrando en cascada y registra DELETE", async () => {
    prismaMock.auditLog.findFirst
      .mockResolvedValueOnce(mkLog({ action: "CREATE", entityType: "Lessee", changes: { after: {} } }))
      .mockResolvedValueOnce(null);
    prismaMock.contract.findMany.mockResolvedValue([]); // inquilino sin contratos

    const { actionUndoChange } = await import("@/server/services/audit-actions");
    await actionUndoChange("log-1");

    expect(prismaMock.lessee.deleteMany).toHaveBeenCalledWith({ where: { id: "l1", tenantId: TENANT } });
    const createArg = prismaMock.auditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
    expect(createArg.data.action).toBe("DELETE");
  });

  it("rechaza si hay un cambio más reciente sobre el mismo registro", async () => {
    prismaMock.auditLog.findFirst
      .mockResolvedValueOnce(mkLog({ action: "UPDATE", changes: { before: {}, after: {} } }))
      .mockResolvedValueOnce({ id: "log-2" }); // existe uno más nuevo

    const { actionUndoChange } = await import("@/server/services/audit-actions");
    await expect(actionUndoChange("log-1")).rejects.toThrow(/más reciente/i);
    expect(prismaMock.lessee.updateMany).not.toHaveBeenCalled();
  });

  it("rechaza cambios no reversibles", async () => {
    prismaMock.auditLog.findFirst.mockResolvedValueOnce(
      mkLog({ action: "UPDATE", entityType: "Expense", changes: { after: {} } }),
    );

    const { actionUndoChange } = await import("@/server/services/audit-actions");
    await expect(actionUndoChange("log-1")).rejects.toThrow();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("falla si el movimiento no existe", async () => {
    prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);
    const { actionUndoChange } = await import("@/server/services/audit-actions");
    await expect(actionUndoChange("missing")).rejects.toThrow(/no encontrado/i);
  });
});
