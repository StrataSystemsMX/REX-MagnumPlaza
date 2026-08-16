import { beforeEach, describe, expect, it, vi } from "vitest";

const contractMock = {
  findFirstOrThrow: vi.fn(),
  findMany: vi.fn(),
};
const rentMock = {
  findMany: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
};

vi.mock("@/server/prisma/client", () => ({
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
  rentMock.deleteMany.mockResolvedValue({ count: 0 });
  rentMock.updateMany.mockResolvedValue({ count: 1 });
});

describe("generateRentsForContract", () => {
  it("genera 12 Rents para un contrato anual (Ene–Dic 2026)", async () => {
    contractMock.findFirstOrThrow.mockResolvedValue(buildContract());
    const { generateRentsForContract } = await import(
      "@/server/services/rent-generation"
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
      "@/server/services/rent-generation"
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
      "@/server/services/rent-generation"
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
      "@/server/services/rent-generation"
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

describe("reconcileRentsForContract", () => {
  it("al acortar el rango: borra las vacías fuera de rango, conserva las que tienen dinero, genera las faltantes y re-sincroniza las sin pago", async () => {
    // Contrato editado a Mar–Jun 2026 (antes era anual).
    const contract = buildContract({
      startDate: new Date(Date.UTC(2026, 2, 1)),
      endDate: new Date(Date.UTC(2026, 5, 30)),
    });
    contractMock.findFirstOrThrow.mockResolvedValue(contract);

    // Rentas existentes antes de editar:
    //   Ene 2026 → FUERA de rango, con pago ($5000)  → se conserva
    //   Feb 2026 → FUERA de rango, vacía             → se elimina
    //   Mar 2026 → dentro de rango, vacía            → re-sincroniza
    //   Abr 2026 → dentro de rango, vacía            → re-sincroniza
    const all = [
      { id: "ene", period: new Date(Date.UTC(2026, 0, 1)), amountPaid: 5000, amountWaived: 0 },
      { id: "feb", period: new Date(Date.UTC(2026, 1, 1)), amountPaid: 0, amountWaived: 0 },
      { id: "mar", period: new Date(Date.UTC(2026, 2, 1)), amountPaid: 0, amountWaived: 0 },
      { id: "abr", period: new Date(Date.UTC(2026, 3, 1)), amountPaid: 0, amountWaived: 0 },
    ];

    rentMock.findMany.mockImplementation((args: { where?: Record<string, unknown>; select?: Record<string, unknown> }) => {
      // Paso 3: rentas sin pago dentro de rango (where filtra amountPaid: 0).
      if (args.where && args.where["amountPaid"] === 0) {
        return Promise.resolve([
          { id: "mar", period: new Date(Date.UTC(2026, 2, 1)) },
          { id: "abr", period: new Date(Date.UTC(2026, 3, 1)) },
          { id: "may", period: new Date(Date.UTC(2026, 4, 1)) },
          { id: "jun", period: new Date(Date.UTC(2026, 5, 1)) },
        ]);
      }
      // Paso 1: todas las rentas (select incluye amountWaived).
      if (args.select && "amountWaived" in args.select) {
        return Promise.resolve(all);
      }
      // generateRentsForContract: periodos existentes tras el borrado (sin "feb").
      return Promise.resolve([
        { period: new Date(Date.UTC(2026, 0, 1)) },
        { period: new Date(Date.UTC(2026, 2, 1)) },
        { period: new Date(Date.UTC(2026, 3, 1)) },
      ]);
    });

    const { reconcileRentsForContract } = await import("@/server/services/rent-generation");

    const result = await reconcileRentsForContract(TENANT, CONTRACT_ID, {
      now: new Date(Date.UTC(2026, 4, 15)),
    });

    // Solo "feb" (vacía, fuera de rango) se elimina; "ene" se conserva.
    expect(rentMock.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["feb"] }, tenantId: TENANT },
    });
    expect(result.removed).toBe(1);
    expect(result.keptWithPayments).toBe(1);
    // generate crea May y Jun (faltantes del nuevo rango).
    expect(result.created).toBe(2);
    // Re-sincroniza las 4 rentas sin pago dentro de rango.
    expect(result.resynced).toBe(4);
    expect(rentMock.updateMany).toHaveBeenCalledTimes(4);
  });

  it("no borra rentas fuera de rango si tienen condonación (amountWaived)", async () => {
    const contract = buildContract({
      startDate: new Date(Date.UTC(2026, 2, 1)),
      endDate: new Date(Date.UTC(2026, 5, 30)),
    });
    contractMock.findFirstOrThrow.mockResolvedValue(contract);

    rentMock.findMany.mockImplementation((args: { where?: Record<string, unknown>; select?: Record<string, unknown> }) => {
      if (args.where && args.where["amountPaid"] === 0) return Promise.resolve([]);
      if (args.select && "amountWaived" in args.select) {
        return Promise.resolve([
          // Ene fuera de rango pero condonada → se conserva.
          { id: "ene", period: new Date(Date.UTC(2026, 0, 1)), amountPaid: 0, amountWaived: 3000 },
        ]);
      }
      return Promise.resolve([]);
    });

    const { reconcileRentsForContract } = await import("@/server/services/rent-generation");
    const result = await reconcileRentsForContract(TENANT, CONTRACT_ID, {
      now: new Date(Date.UTC(2026, 4, 15)),
    });

    expect(rentMock.deleteMany).not.toHaveBeenCalled();
    expect(result.removed).toBe(0);
    expect(result.keptWithPayments).toBe(1);
  });
});
