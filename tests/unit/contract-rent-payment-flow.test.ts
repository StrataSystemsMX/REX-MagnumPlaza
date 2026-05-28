/**
 * Flujo end-to-end del ciclo de vida principal del sistema:
 *   DRAFT → ACTIVE (genera rentas) → pago parcial → pago completo → terminación
 *
 * Cada fase simula el estado que dejarían los pasos anteriores,
 * verificando que las invariantes del negocio se mantienen en cadena.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// ── Mocks de infraestructura ─────────────────────────────────────────────────

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGenerateRents = vi.fn();
const mockSendPaymentConfirmation = vi.fn();

const contractMock = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
};
const unitMock = { findFirst: vi.fn(), updateMany: vi.fn() };
const lesseeMock = { findFirst: vi.fn() };
const rentMock = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
};
const paymentMock = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
};
const auditLogMock = { create: vi.fn() };
const userRoleMock = { findFirst: vi.fn() };

const txContractMock = { contract: contractMock, unit: unitMock };
const txPaymentMock = { payment: paymentMock, rent: rentMock };

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
vi.mock("@/lib/services/rent-generation", () => ({
  generateRentsForContract: (...args: unknown[]) => mockGenerateRents(...args),
}));
vi.mock("@/lib/services/notifications", () => ({
  sendPaymentConfirmation: (...args: unknown[]) => mockSendPaymentConfirmation(...args),
}));
vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    contract: contractMock,
    unit: unitMock,
    lessee: lesseeMock,
    rent: rentMock,
    payment: paymentMock,
    auditLog: auditLogMock,
    userRole: userRoleMock,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
      // La función recibe el mock correcto según el módulo que la llama.
      // Para contracts usamos txContractMock; para payments txPaymentMock.
      try {
        return await fn(txContractMock);
      } catch {
        return await fn(txPaymentMock);
      }
    },
  },
  prismaUnsafe: {},
}));

const TENANT = "tenant-1";
const USER = "db-user-1";
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
});

// ============================================================================
// FASE 1 — Crear contrato en DRAFT
// ============================================================================

describe("Fase 1 — Crear contrato", () => {
  it("crea en DRAFT, marca la unit RENTADA, no genera rentas todavía", async () => {
    unitMock.findFirst.mockResolvedValue({
      id: "unit-1",
      code: "L1",
      status: "DISPONIBLE",
      property: { status: "ACTIVO", name: "Plaza Progreso" },
    });
    lesseeMock.findFirst.mockResolvedValue({ id: "lessee-1" });
    contractMock.create.mockResolvedValue({
      id: "contract-1",
      unitId: "unit-1",
      lesseeId: "lessee-1",
      status: "DRAFT",
      monthlyAmount: new Prisma.Decimal(13500),
      startDate: utc(2026, 0, 1),
      endDate: utc(2026, 11, 31),
    });

    const { actionCreateContract } = await import("@/lib/services/contracts");
    const contract = await actionCreateContract({
      unitId: "unit-1",
      lesseeId: "lessee-1",
      type: "ARRENDAMIENTO",
      startDate: utc(2026, 0, 1),
      endDate: utc(2026, 11, 31),
      monthlyAmount: 13500,
      guaranteeAmount: 13500,
      paymentDay: 1,
      lateFeePercentage: 5,
      autoRenew: false,
      paidInAdvance: false,
    });

    expect(contract.status).toBe("DRAFT");
    expect(unitMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "RENTADA" } }),
    );
    expect(mockGenerateRents).not.toHaveBeenCalled();
  });

  it("rechaza si la unit ya está RENTADA", async () => {
    unitMock.findFirst.mockResolvedValue({ id: "unit-1", status: "RENTADA" });
    const { actionCreateContract } = await import("@/lib/services/contracts");
    await expect(
      actionCreateContract({
        unitId: "unit-1",
        lesseeId: "lessee-1",
        type: "ARRENDAMIENTO",
        startDate: utc(2026, 0, 1),
        endDate: utc(2026, 11, 31),
        monthlyAmount: 13500,
        guaranteeAmount: 13500,
        paymentDay: 1,
        lateFeePercentage: 5,
        autoRenew: false,
        paidInAdvance: false,
      }),
    ).rejects.toThrow(/ya está rentada/i);
  });
});

// ============================================================================
// FASE 2 — Activar contrato (DRAFT → ACTIVE + genera rentas)
// ============================================================================

describe("Fase 2 — Activar contrato", () => {
  it("DRAFT → ACTIVE y genera 12 rentas mensuales", async () => {
    contractMock.findFirst.mockResolvedValue({ id: "contract-1", status: "DRAFT" });
    contractMock.findFirstOrThrow.mockResolvedValue({ id: "contract-1", status: "ACTIVE" });
    mockGenerateRents.mockResolvedValue({
      contractId: "contract-1",
      created: 12,
      skipped: 0,
      total: 12,
    });

    const { actionActivateContract } = await import("@/lib/services/contracts");
    const result = await actionActivateContract("contract-1");

    expect(result.rentsCreated).toBe(12);
    expect(mockGenerateRents).toHaveBeenCalledWith(TENANT, "contract-1");

    const statusUpdate = contractMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(statusUpdate.data.status).toBe("ACTIVE");
  });

  it("no activa un contrato que ya está ACTIVE", async () => {
    contractMock.findFirst.mockResolvedValue({ id: "contract-1", status: "ACTIVE" });
    const { actionActivateContract } = await import("@/lib/services/contracts");
    await expect(actionActivateContract("contract-1")).rejects.toThrow(/borrador/i);
    expect(mockGenerateRents).not.toHaveBeenCalled();
  });
});

// ============================================================================
// FASE 3 — Registrar pagos sobre una renta generada
// ============================================================================

describe("Fase 3 — Registrar pagos", () => {
  const rentLookup = () => ({
    id: "rent-1",
    contractId: "contract-1",
    period: utc(2026, 0, 1),
    amountDue: new Prisma.Decimal(13500),
    amountPaid: new Prisma.Decimal(0),
    amountWaived: new Prisma.Decimal(0),
  });

  const rentRow = (paid: number) => ({
    id: "rent-1",
    amountDue: new Prisma.Decimal(13500),
    dueDate: utc(2026, 0, 5),
    status: paid >= 13500 ? "PAID" : ("DUE" as const),
  });

  it("pago parcial → renta queda PARTIAL", async () => {
    rentMock.findFirst.mockResolvedValue(rentLookup());
    paymentMock.create.mockResolvedValue({ id: "pay-1" });
    paymentMock.findMany.mockResolvedValue([{ amount: 5000 }]);
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(5000));

    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const result = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 5000,
      paymentDate: utc(2026, 0, 10),
      method: "TRANSFER",
    });

    expect(result.rentStatus).toBe("PARTIAL");
    const updateArg = rentMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string; amountPaid: Prisma.Decimal };
    };
    expect(updateArg.data.amountPaid.toString()).toBe("5000");
  });

  it("segundo pago completa la renta → PAID", async () => {
    rentMock.findFirst.mockResolvedValue(rentLookup());
    paymentMock.create.mockResolvedValue({ id: "pay-2" });
    // La suma de los dos pagos cubre el total
    paymentMock.findMany.mockResolvedValue([{ amount: 5000 }, { amount: 8500 }]);
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(13500));

    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const result = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 8500,
      paymentDate: utc(2026, 0, 15),
      method: "CASH",
    });

    expect(result.rentStatus).toBe("PAID");
    const updateArg = rentMock.updateMany.mock.calls.at(-1)?.[0] as {
      data: { status: string; amountPaid: Prisma.Decimal };
    };
    expect(updateArg.data.status).toBe("PAID");
    expect(updateArg.data.amountPaid.toString()).toBe("13500");
  });
});

// ============================================================================
// FASE 4 — Terminar contrato (libera la unit)
// ============================================================================

describe("Fase 4 — Terminar contrato", () => {
  it("ACTIVE → TERMINATED, unit pasa a DISPONIBLE", async () => {
    contractMock.findFirst.mockResolvedValue({
      id: "contract-1",
      unitId: "unit-1",
      status: "ACTIVE",
      notes: "",
    });
    contractMock.findFirstOrThrow.mockResolvedValue({
      id: "contract-1",
      status: "TERMINATED",
    });

    const { actionTerminateContract } = await import("@/lib/services/contracts");
    await actionTerminateContract("contract-1", {
      terminationDate: utc(2026, 11, 31),
      reason: "Fin de contrato acordado.",
    });

    const contractUpdate = contractMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(contractUpdate.data.status).toBe("TERMINATED");

    const unitUpdate = unitMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(unitUpdate.data.status).toBe("DISPONIBLE");
  });

  it("el AuditLog incluye la razón de terminación y la unit liberada", async () => {
    contractMock.findFirst.mockResolvedValue({
      id: "contract-1",
      unitId: "unit-1",
      status: "ACTIVE",
      notes: "",
    });
    contractMock.findFirstOrThrow.mockResolvedValue({ id: "contract-1", status: "TERMINATED" });

    const { actionTerminateContract } = await import("@/lib/services/contracts");
    await actionTerminateContract("contract-1", {
      terminationDate: utc(2026, 11, 31),
      reason: "No renovó.",
    });

    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { changes: { reason: string; unitReleased: string } };
    };
    expect(auditArg.data.changes.reason).toBe("No renovó.");
    expect(auditArg.data.changes.unitReleased).toBe("unit-1");
  });

  it("no se puede terminar un contrato ya TERMINATED", async () => {
    contractMock.findFirst.mockResolvedValue({
      id: "contract-1",
      unitId: "unit-1",
      status: "TERMINATED",
      notes: "",
    });

    const { actionTerminateContract } = await import("@/lib/services/contracts");
    await expect(
      actionTerminateContract("contract-1", {
        terminationDate: utc(2026, 11, 31),
        reason: "Doble terminación.",
      }),
    ).rejects.toThrow(/terminado/i);
    expect(unitMock.updateMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Caso edge — Condonar renta (WAIVED)
// ============================================================================

describe("Condonación de renta", () => {
  it("renta condonada no bloquea registrar un pago posterior", async () => {
    rentMock.findFirst.mockResolvedValue({
      id: "rent-1",
      contractId: "contract-1",
      period: utc(2026, 0, 1),
      amountDue: new Prisma.Decimal(13500),
      amountPaid: new Prisma.Decimal(0),
      amountWaived: new Prisma.Decimal(0),
    });
    paymentMock.create.mockResolvedValue({ id: "pay-1" });
    paymentMock.findMany.mockResolvedValue([{ amount: 13500 }]);
    rentMock.findFirstOrThrow.mockResolvedValue({
      id: "rent-1",
      amountDue: new Prisma.Decimal(13500),
      dueDate: utc(2026, 0, 5),
      status: "WAIVED" as const,
    });

    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const result = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 13500,
      paymentDate: utc(2026, 0, 20),
      method: "TRANSFER",
    });

    // El pago cubre el total, recalcula desde WAIVED → PAID
    expect(result.rentStatus).toBe("PAID");
  });
});
