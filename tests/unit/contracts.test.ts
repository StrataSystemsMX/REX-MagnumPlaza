import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGenerateRents = vi.fn();

const contractMock = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
};
const unitMock = {
  findFirst: vi.fn(),
  updateMany: vi.fn(),
};
const lesseeMock = {
  findFirst: vi.fn(),
};
const auditLogMock = { create: vi.fn() };
const userRoleMock = { findFirst: vi.fn() };

const txMock = {
  contract: contractMock,
  unit: unitMock,
};

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

vi.mock("@/lib/services/rent-generation", () => ({
  generateRentsForContract: (...args: unknown[]) => mockGenerateRents(...args),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    contract: contractMock,
    unit: unitMock,
    lessee: lesseeMock,
    auditLog: auditLogMock,
    userRole: userRoleMock,
    $transaction: async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
  },
  prismaUnsafe: {},
}));

const VALID_INPUT = {
  unitId: "unit-1",
  lesseeId: "lessee-1",
  type: "ARRENDAMIENTO" as const,
  startDate: new Date(Date.UTC(2026, 0, 1)),
  endDate: new Date(Date.UTC(2026, 11, 31)),
  monthlyAmount: 13500,
  guaranteeAmount: 13500,
  paymentDay: 1,
  lateFeePercentage: 5,
  autoRenew: false,
  friendlyReminderEnabled: false,
  paidInAdvance: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    userId: "clerk_1",
    tenantId: "tenant-1",
    user: {},
    dbUser: { id: "db-1", tenantId: "tenant-1" },
  });
  mockRequirePermission.mockResolvedValue(undefined);
});

describe("actionCreateContract", () => {
  it("falla cuando la unit ya está RENTADA", async () => {
    unitMock.findFirst.mockResolvedValue({
      id: "unit-1",
      code: "L1",
      status: "RENTADA",
    });

    const { actionCreateContract } = await import("@/lib/services/contracts");

    await expect(actionCreateContract(VALID_INPUT)).rejects.toThrow(
      /ya está rentada/i,
    );
    expect(contractMock.create).not.toHaveBeenCalled();
  });

  it("crea contrato en DRAFT, marca unit RENTADA y escribe AuditLog", async () => {
    unitMock.findFirst.mockResolvedValue({
      id: "unit-1",
      code: "L1",
      status: "DISPONIBLE",
      // El código valida que el inmueble no esté BLOQUEADO antes de crear.
      property: { status: "EN_RENTA", name: "Plaza Test" },
    });
    lesseeMock.findFirst.mockResolvedValue({ id: "lessee-1" });
    contractMock.create.mockResolvedValue({
      id: "contract-1",
      unitId: "unit-1",
      lesseeId: "lessee-1",
      monthlyAmount: { toString: () => "13500" },
      startDate: new Date(Date.UTC(2026, 0, 1)),
      endDate: new Date(Date.UTC(2026, 11, 31)),
    });

    const { actionCreateContract } = await import("@/lib/services/contracts");
    const result = await actionCreateContract(VALID_INPUT);

    expect(result).toMatchObject({ id: "contract-1" });
    expect(contractMock.create).toHaveBeenCalledOnce();
    const createArg = contractMock.create.mock.calls[0]?.[0] as {
      data: { tenantId: string; status: string };
    };
    expect(createArg.data.tenantId).toBe("tenant-1");
    expect(createArg.data.status).toBe("DRAFT");

    expect(unitMock.updateMany).toHaveBeenCalledOnce();
    const updArg = unitMock.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
      data: { status: string };
    };
    expect(updArg.where).toEqual({ id: "unit-1", tenantId: "tenant-1" });
    expect(updArg.data.status).toBe("RENTADA");

    expect(auditLogMock.create).toHaveBeenCalledOnce();
    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { entityType: string; action: string };
    };
    expect(auditArg.data.entityType).toBe("Contract");
    expect(auditArg.data.action).toBe("CREATE");
  });
});

describe("actionTerminateContract", () => {
  it("libera la unit (DISPONIBLE) y marca el contrato TERMINATED, sin tocar Rents", async () => {
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
      terminationDate: new Date(Date.UTC(2026, 5, 30)),
      reason: "Inquilino desocupó.",
    });

    expect(contractMock.updateMany).toHaveBeenCalledOnce();
    const cArg = contractMock.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
      data: { status: string };
    };
    expect(cArg.where).toEqual({ id: "contract-1", tenantId: "tenant-1" });
    expect(cArg.data.status).toBe("TERMINATED");

    expect(unitMock.updateMany).toHaveBeenCalledOnce();
    const uArg = unitMock.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
      data: { status: string };
    };
    expect(uArg.where).toEqual({ id: "unit-1", tenantId: "tenant-1" });
    expect(uArg.data.status).toBe("DISPONIBLE");

    // Auditoría detallada
    const aArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { changes: { reason: string; unitReleased: string } };
    };
    expect(aArg.data.changes.reason).toBe("Inquilino desocupó.");
    expect(aArg.data.changes.unitReleased).toBe("unit-1");
  });
});

describe("actionActivateContract", () => {
  it("activa el contrato y dispara la generación de rentas", async () => {
    contractMock.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "DRAFT",
    });
    contractMock.findFirstOrThrow.mockResolvedValue({
      id: "contract-1",
      status: "ACTIVE",
    });
    mockGenerateRents.mockResolvedValue({ contractId: "contract-1", created: 12, skipped: 0, total: 12 });

    const { actionActivateContract } = await import("@/lib/services/contracts");
    const result = await actionActivateContract("contract-1");

    expect(result.rentsCreated).toBe(12);
    expect(mockGenerateRents).toHaveBeenCalledWith("tenant-1", "contract-1");
    const arg = contractMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(arg.data.status).toBe("ACTIVE");
  });

  it("rechaza activar un contrato que no está en DRAFT", async () => {
    contractMock.findFirst.mockResolvedValue({ id: "contract-1", status: "ACTIVE" });
    const { actionActivateContract } = await import("@/lib/services/contracts");
    await expect(actionActivateContract("contract-1")).rejects.toThrow(/borrador/i);
    expect(mockGenerateRents).not.toHaveBeenCalled();
  });
});
