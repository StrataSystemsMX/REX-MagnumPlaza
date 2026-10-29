import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();

const guaranteeMock = {
  create: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
};
const contractMock = { findFirstOrThrow: vi.fn() };
const maintenanceMock = { deleteMany: vi.fn(), createMany: vi.fn() };
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
const txMock = {
  guarantee: guaranteeMock,
  contract: contractMock,
  maintenance: maintenanceMock,
  auditLog: auditLogMock,
};
vi.mock("@/server/prisma/client", () => ({
  prisma: {
    guarantee: guaranteeMock,
    contract: contractMock,
    maintenance: maintenanceMock,
    auditLog: auditLogMock,
    $transaction: async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
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
});

// ============================================================================
// actionCreateGuarantee
// ============================================================================

describe("actionCreateGuarantee", () => {
  it("crea garantía con status HELD y escribe AuditLog", async () => {
    contractMock.findFirstOrThrow.mockResolvedValue({ id: "contract-1" });
    guaranteeMock.create.mockResolvedValue({ id: "guarantee-1" });

    const { actionCreateGuarantee } = await import("@/server/services/guarantees");
    const result = await actionCreateGuarantee({
      contractId: "contract-1",
      amount: 13500,
      receivedDate: utc(2026, 0, 1),
    });

    expect(result).toMatchObject({ id: "guarantee-1" });

    const createArg = guaranteeMock.create.mock.calls[0]?.[0] as {
      data: { status: string; amount: Prisma.Decimal; tenantId: string };
    };
    expect(createArg.data.status).toBe("HELD");
    expect(createArg.data.amount.toString()).toBe("13500");
    expect(createArg.data.tenantId).toBe(TENANT);

    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("Guarantee");
  });

  it("falla si el contrato no pertenece al tenant", async () => {
    contractMock.findFirstOrThrow.mockRejectedValue(new Error("Not found"));

    const { actionCreateGuarantee } = await import("@/server/services/guarantees");
    await expect(
      actionCreateGuarantee({
        contractId: "contract-x",
        amount: 5000,
        receivedDate: utc(2026, 0, 1),
      }),
    ).rejects.toThrow();
    expect(guaranteeMock.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionReturnGuarantee
// ============================================================================

describe("actionReturnGuarantee", () => {
  it("devolución total sin deducciones → status RETURNED", async () => {
    guaranteeMock.findFirstOrThrow.mockResolvedValue({
      id: "guarantee-1",
      amount: new Prisma.Decimal(13500),
      contractId: "contract-1",
    });
    maintenanceMock.deleteMany.mockResolvedValue({ count: 0 });

    const { actionReturnGuarantee } = await import("@/server/services/guarantees");
    await actionReturnGuarantee({
      guaranteeId: "guarantee-1",
      returnedAmount: 13500,
      returnedDate: utc(2026, 11, 31),
      deductions: [],
    });

    const updateArg = guaranteeMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string; returnedAmount: Prisma.Decimal };
    };
    expect(updateArg.data.status).toBe("RETURNED");
    expect(updateArg.data.returnedAmount.toString()).toBe("13500");
    expect(maintenanceMock.createMany).not.toHaveBeenCalled();
  });

  it("devolución parcial → status PARTIALLY_RETURNED", async () => {
    guaranteeMock.findFirstOrThrow.mockResolvedValue({
      id: "guarantee-1",
      amount: new Prisma.Decimal(13500),
      contractId: "contract-1",
    });
    maintenanceMock.deleteMany.mockResolvedValue({ count: 0 });

    const { actionReturnGuarantee } = await import("@/server/services/guarantees");
    await actionReturnGuarantee({
      guaranteeId: "guarantee-1",
      returnedAmount: 8000,
      returnedDate: utc(2026, 11, 31),
      deductions: [],
    });

    const updateArg = guaranteeMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateArg.data.status).toBe("PARTIALLY_RETURNED");
  });

  it("deducciones crean mantenimientos correctivos con marker de fianza", async () => {
    guaranteeMock.findFirstOrThrow.mockResolvedValue({
      id: "guarantee-1",
      amount: new Prisma.Decimal(13500),
      contractId: "contract-1",
    });
    maintenanceMock.deleteMany.mockResolvedValue({ count: 0 });
    contractMock.findFirstOrThrow.mockResolvedValue({
      unit: { id: "unit-1", propertyId: "prop-1" },
    });

    const { actionReturnGuarantee } = await import("@/server/services/guarantees");
    await actionReturnGuarantee({
      guaranteeId: "guarantee-1",
      returnedAmount: 11500,
      returnedDate: utc(2026, 11, 31),
      deductions: [
        { concept: "Daño en puerta", amount: 1000 },
        { concept: "Pintura", amount: 1000 },
      ],
    });

    expect(maintenanceMock.createMany).toHaveBeenCalledOnce();
    const createArg = maintenanceMock.createMany.mock.calls[0]?.[0] as {
      data: Array<{ type: string; responsibility: string; notes: string; status: string }>;
    };
    expect(createArg.data).toHaveLength(2);
    expect(createArg.data[0]?.type).toBe("CORRECTIVE");
    expect(createArg.data[0]?.responsibility).toBe("LESSEE");
    expect(createArg.data[0]?.status).toBe("COMPLETED");
    expect(createArg.data[0]?.notes).toContain("[deposit:guarantee-1]");
  });

  it("falla si el monto devuelto excede el depósito original", async () => {
    guaranteeMock.findFirstOrThrow.mockResolvedValue({
      id: "guarantee-1",
      amount: new Prisma.Decimal(10000),
      contractId: "contract-1",
    });

    const { actionReturnGuarantee } = await import("@/server/services/guarantees");
    await expect(
      actionReturnGuarantee({
        guaranteeId: "guarantee-1",
        returnedAmount: 15000,
        returnedDate: utc(2026, 11, 31),
        deductions: [],
      }),
    ).rejects.toThrow(/no puede exceder/i);
    expect(guaranteeMock.updateMany).not.toHaveBeenCalled();
  });

  it("re-devolución limpia mantenimientos previos del mismo depósito", async () => {
    guaranteeMock.findFirstOrThrow.mockResolvedValue({
      id: "guarantee-1",
      amount: new Prisma.Decimal(13500),
      contractId: "contract-1",
    });
    maintenanceMock.deleteMany.mockResolvedValue({ count: 2 });
    contractMock.findFirstOrThrow.mockResolvedValue({
      unit: { id: "unit-1", propertyId: "prop-1" },
    });

    const { actionReturnGuarantee } = await import("@/server/services/guarantees");
    await actionReturnGuarantee({
      guaranteeId: "guarantee-1",
      returnedAmount: 12000,
      returnedDate: utc(2026, 11, 31),
      deductions: [{ concept: "Vidrio roto", amount: 1500 }],
    });

    // Primero borra los viejos, luego crea los nuevos
    expect(maintenanceMock.deleteMany).toHaveBeenCalledBefore(maintenanceMock.createMany);
    const deleteArg = maintenanceMock.deleteMany.mock.calls[0]?.[0] as {
      where: { notes: { contains: string } };
    };
    expect(deleteArg.where.notes.contains).toContain("[deposit:guarantee-1]");
  });
});
