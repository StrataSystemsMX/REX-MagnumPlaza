import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
const guaranteeMock = { findMany: vi.fn() };
const loanMock = { findMany: vi.fn() };
const investmentProjectMock = { findMany: vi.fn() };
const maintenanceMock = { findMany: vi.fn() };

vi.mock("@/server/auth/get-session", () => ({
  requireAuth: () => mockRequireAuth(),
}));
vi.mock("@/server/auth/active-legal-entity", () => ({
  getActiveLegalEntityId: () => Promise.resolve(null),
}));
vi.mock("@/server/prisma/client", () => ({
  prisma: {
    guarantee: guaranteeMock,
    loan: loanMock,
    investmentProject: investmentProjectMock,
    maintenance: maintenanceMock,
  },
}));

const TENANT = "tenant-1";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ tenantId: TENANT });
  guaranteeMock.findMany.mockResolvedValue([]);
  loanMock.findMany.mockResolvedValue([]);
  investmentProjectMock.findMany.mockResolvedValue([]);
  maintenanceMock.findMany.mockResolvedValue([]);
});

// ============================================================================
// Regla compartida por las 4: "muestra lo que sigue abierto/activo SIN
// importar el año, más lo que tuvo actividad (inicio/fin/agenda) en el año
// seleccionado". Sin year, no debe agregarse ningún filtro extra.
// ============================================================================

describe("getGuarantees — filtro de año", () => {
  it("sin year no agrega cláusula OR", async () => {
    const { getGuarantees } = await import("@/server/services/guarantees-queries");
    await getGuarantees({});
    const call = guaranteeMock.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where["OR"]).toBeUndefined();
  });

  it("con year: HELD/PARTIALLY_RETURNED siempre + recibido/devuelto en el año", async () => {
    const { getGuarantees } = await import("@/server/services/guarantees-queries");
    await getGuarantees({ year: 2026 });
    const call = guaranteeMock.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toEqual([
      { status: { in: ["HELD", "PARTIALLY_RETURNED"] } },
      { receivedDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
      { returnedDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
    ]);
  });
});

describe("getLoans — filtro de año", () => {
  it("sin year no agrega cláusula OR", async () => {
    const { getLoans } = await import("@/server/services/prestamos-queries");
    await getLoans({});
    const call = loanMock.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where["OR"]).toBeUndefined();
  });

  it("con year: ACTIVE siempre + arrancó/terminó en el año", async () => {
    const { getLoans } = await import("@/server/services/prestamos-queries");
    await getLoans({ year: 2026 });
    const call = loanMock.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toEqual([
      { status: "ACTIVE" },
      { startDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
      { endDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
    ]);
  });
});

describe("getInvestmentProjects — filtro de año", () => {
  it("sin year no agrega cláusula OR, pero conserva status:{not:CANCELLED}", async () => {
    const { getInvestmentProjects } = await import("@/server/services/inversiones-queries");
    await getInvestmentProjects({});
    const call = investmentProjectMock.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where["OR"]).toBeUndefined();
    expect(call.where["status"]).toEqual({ not: "CANCELLED" });
  });

  it("con year: PLANNING/ACTIVE/PAUSED siempre + arrancó/cerró en el año", async () => {
    const { getInvestmentProjects } = await import("@/server/services/inversiones-queries");
    await getInvestmentProjects({ year: 2026 });
    const call = investmentProjectMock.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toEqual([
      { status: { in: ["PLANNING", "ACTIVE", "PAUSED"] } },
      { startDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
      { endDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
    ]);
  });
});

describe("getMaintenances — filtro de año", () => {
  it("sin year no agrega cláusula OR", async () => {
    const { getMaintenances } = await import("@/server/services/maintenances-queries");
    await getMaintenances({});
    const call = maintenanceMock.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where["OR"]).toBeUndefined();
  });

  it("con year: PLANNED/IN_PROGRESS siempre + agendado/completado en el año", async () => {
    const { getMaintenances } = await import("@/server/services/maintenances-queries");
    await getMaintenances({ year: 2026 });
    const call = maintenanceMock.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toEqual([
      { status: { in: ["PLANNED", "IN_PROGRESS"] } },
      { scheduledDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
      { completedDate: { gte: utc(2026, 0, 1), lt: utc(2027, 0, 1) } },
    ]);
  });

  it("combina year con otros filtros existentes (status, propertyId) sin pisarlos", async () => {
    const { getMaintenances } = await import("@/server/services/maintenances-queries");
    await getMaintenances({ year: 2026, propertyId: "prop-1" });
    const call = maintenanceMock.findMany.mock.calls[0]?.[0] as {
      where: { propertyId: string; OR: unknown };
    };
    expect(call.where.propertyId).toBe("prop-1");
    expect(call.where.OR).toBeDefined();
  });
});
