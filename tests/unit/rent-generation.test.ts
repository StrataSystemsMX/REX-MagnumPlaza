import { beforeEach, describe, expect, it, vi } from "vitest";

const contractMock = {
  findFirstOrThrow: vi.fn(),
  findMany: vi.fn(),
};
const rentMock = {
  findMany: vi.fn(),
  createMany: vi.fn(),
};

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    contract: contractMock,
    rent: rentMock,
  },
  prismaUnsafe: {},
}));

const TENANT = "tenant-1";
const CONTRACT_ID = "contract-1";

function buildContract(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT,
    monthlyAmount: 10000,
    paymentDay: 1,
    paidInAdvance: false,
    advancePaidUntil: null,
    startDate: new Date(Date.UTC(2026, 0, 1)),
    endDate: new Date(Date.UTC(2026, 11, 31)),
    unit: { property: { managerEntityId: "le-1" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rentMock.findMany.mockResolvedValue([]);
  rentMock.createMany.mockResolvedValue({ count: 0 });
});

describe("generateRentsForContract", () => {
  it("genera 12 Rents para un contrato anual (Ene–Dic 2026)", async () => {
    contractMock.findFirstOrThrow.mockResolvedValue(buildContract());
    const { generateRentsForContract } = await import(
      "@/lib/services/rent-generation"
    );

    const result = await generateRentsForContract(TENANT, CONTRACT_ID, {
      now: new Date(Date.UTC(2026, 0, 15)),
    });

    expect(result.total).toBe(12);
    expect(result.created).toBe(12);
    expect(rentMock.createMany).toHaveBeenCalledOnce();
    const arg = rentMock.createMany.mock.calls[0]?.[0] as {
      data: Array<{ period: Date; status: string; tenantId: string; legalEntityId: string }>;
    };
    expect(arg.data).toHaveLength(12);
    expect(arg.data[0]?.tenantId).toBe(TENANT);
    expect(arg.data[0]?.legalEntityId).toBe("le-1");
    expect(arg.data[0]?.period.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(arg.data[11]?.period.toISOString().slice(0, 10)).toBe("2026-12-01");
  });

  it("marca PAID los meses dentro de paidInAdvance / advancePaidUntil", async () => {
    contractMock.findFirstOrThrow.mockResolvedValue(
      buildContract({
        paidInAdvance: true,
        advancePaidUntil: new Date(Date.UTC(2026, 5, 30)), // hasta junio
      }),
    );
    const { generateRentsForContract } = await import(
      "@/lib/services/rent-generation"
    );

    await generateRentsForContract(TENANT, CONTRACT_ID, {
      now: new Date(Date.UTC(2026, 0, 1)),
    });

    const arg = rentMock.createMany.mock.calls[0]?.[0] as {
      data: Array<{ period: Date; status: string; amountPaid: unknown }>;
    };
    // Los primeros 6 meses (Ene–Jun) deben estar PAID, el resto NO.
    for (let i = 0; i < 6; i++) {
      expect(arg.data[i]?.status).toBe("PAID");
    }
    for (let i = 6; i < arg.data.length; i++) {
      expect(arg.data[i]?.status).not.toBe("PAID");
    }
  });

  it("es idempotente: no duplica Rents para periodos ya existentes", async () => {
    contractMock.findFirstOrThrow.mockResolvedValue(buildContract());
    rentMock.findMany.mockResolvedValue([
      { period: new Date(Date.UTC(2026, 0, 1)) },
      { period: new Date(Date.UTC(2026, 1, 1)) },
    ]);
    const { generateRentsForContract } = await import(
      "@/lib/services/rent-generation"
    );

    const result = await generateRentsForContract(TENANT, CONTRACT_ID, {
      now: new Date(Date.UTC(2026, 0, 15)),
    });

    expect(result.total).toBe(12);
    expect(result.created).toBe(10);
    expect(result.skipped).toBe(2);
    const arg = rentMock.createMany.mock.calls[0]?.[0] as {
      data: Array<{ period: Date }>;
    };
    expect(arg.data).toHaveLength(10);
  });

  it("aplica el gradiente DUE/OVERDUE_*/PENDING según días vencidos", async () => {
    contractMock.findFirstOrThrow.mockResolvedValue(buildContract());
    const { generateRentsForContract } = await import(
      "@/lib/services/rent-generation"
    );

    await generateRentsForContract(TENANT, CONTRACT_ID, {
      now: new Date(Date.UTC(2026, 3, 15)), // 15 abril 2026
    });

    const arg = rentMock.createMany.mock.calls[0]?.[0] as {
      data: Array<{ status: string }>;
    };
    // dueDate=día 1 de cada mes, now=15 abril 2026:
    //   Ene 2026 → 104 d → OVERDUE_3M
    //   Feb 2026 →  73 d → OVERDUE_2M
    //   Mar 2026 →  45 d → OVERDUE_1M
    //   Abr 2026 →  14 d → DUE
    //   May+    → futuro → PENDING
    expect(arg.data[0]?.status).toBe("OVERDUE_3M");
    expect(arg.data[1]?.status).toBe("OVERDUE_2M");
    expect(arg.data[2]?.status).toBe("OVERDUE_1M");
    expect(arg.data[3]?.status).toBe("DUE");
    expect(arg.data[4]?.status).toBe("PENDING");
    expect(arg.data[11]?.status).toBe("PENDING");
  });
});
