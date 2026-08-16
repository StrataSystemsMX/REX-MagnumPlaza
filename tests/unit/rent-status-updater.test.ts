import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const rentMock = {
  findMany: vi.fn(),
  updateMany: vi.fn(),
};
const auditLogMock = { create: vi.fn() };

const txMock = { rent: rentMock, auditLog: auditLogMock };
vi.mock("@/server/prisma/client", () => ({
  prisma: {
    rent: rentMock,
    auditLog: auditLogMock,
    $transaction: async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
  },
  prismaUnsafe: {},
}));

const mockSendRentReminder = vi.fn();
vi.mock("@/server/services/notifications", () => ({
  sendRentReminder: (...args: unknown[]) => mockSendRentReminder(...args),
}));

const TENANT = "tenant-1";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const D = (n: number) => new Prisma.Decimal(n);

beforeEach(() => {
  vi.clearAllMocks();
});

interface RentRow {
  id: string;
  contractId: string;
  amountDue: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountWaived: Prisma.Decimal;
  lateFeeAccrued: Prisma.Decimal;
  dueDate: Date;
  status: string;
  contract: { lateFeePercentage: Prisma.Decimal | null; friendlyReminderEnabled: boolean };
}

function rent(
  id: string,
  dueDate: Date,
  status: RentRow["status"],
  paid = 0,
  due = 10000,
  lateFeePct: number | null = null,
  lateFeeAccrued = 0,
  friendlyReminderEnabled = false,
): RentRow {
  return {
    id,
    contractId: `c-${id}`,
    amountDue: D(due),
    amountPaid: D(paid),
    amountWaived: D(0),
    lateFeeAccrued: D(lateFeeAccrued),
    dueDate,
    status,
    contract: {
      lateFeePercentage: lateFeePct === null ? null : D(lateFeePct),
      friendlyReminderEnabled,
    },
  };
}

describe("updateRentStatuses", () => {
  it("DUE → OVERDUE_1M cuando pasa de 30 días vencido", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "DUE"), // 1 marzo 2026
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const result = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) }); // 5 abril → 35 días vencido

    expect(result.rentsUpdated).toBe(1);
    expect(result.byNewStatus.OVERDUE_1M).toBe(1);
    expect(result.overdueTransitions).toBe(1);
    expect(rentMock.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: TENANT },
      data: { status: "OVERDUE_1M" },
    });
    expect(auditLogMock.create).toHaveBeenCalledOnce();
    const audit = auditLogMock.create.mock.calls[0]?.[0] as {
      data: {
        userId: null;
        action: string;
        entityType: string;
        changes: { transition: { from: string; to: string }; level: number };
      };
    };
    expect(audit.data.userId).toBeNull();
    expect(audit.data.action).toBe("UPDATE");
    expect(audit.data.entityType).toBe("Rent");
    expect(audit.data.changes.transition.from).toBe("DUE");
    expect(audit.data.changes.transition.to).toBe("OVERDUE_1M");
    expect(audit.data.changes.level).toBe(1);
  });

  it("OVERDUE_1M → OVERDUE_2M cuando pasa de 60 días", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 1, 1), "OVERDUE_1M"), // 1 feb 2026
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) }); // 63 días
    expect(r.byNewStatus.OVERDUE_2M).toBe(1);
    expect(r.overdueTransitions).toBe(1);
  });

  it("OVERDUE_2M → OVERDUE_3M cuando pasa de 90 días", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 0, 1), "OVERDUE_2M"), // 1 ene 2026
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) }); // 94 días
    expect(r.byNewStatus.OVERDUE_3M).toBe(1);
    expect(r.overdueTransitions).toBe(1);
  });

  it("PENDING → DUE cuando dueDate llega", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 3, 1), "PENDING"),
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(r.byNewStatus.DUE).toBe(1);
    // Transición a DUE NO es OVERDUE → no se escribe AuditLog.
    expect(auditLogMock.create).not.toHaveBeenCalled();
  });

  it("PARTIAL se mantiene si amountPaid > 0 y aún no pasa el umbral de OVERDUE", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "PARTIAL", 5000),
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 2, 15) });
    expect(r.rentsUpdated).toBe(0);
    expect(rentMock.updateMany).not.toHaveBeenCalled();
  });

  it("Rent con amountPaid >= amountDue queda PAID y no avanza (defensa)", async () => {
    rentMock.findMany.mockResolvedValue([
      // estado erróneo: status=DUE pero amountPaid completo
      rent("r1", utc(2026, 0, 1), "DUE", 10000),
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(r.byNewStatus.PAID).toBe(1);
    expect(r.overdueTransitions).toBe(0);
    expect(auditLogMock.create).not.toHaveBeenCalled(); // PAID no es OVERDUE
  });

  it("no avanza PAID/WAIVED; sí incluye OVERDUE_3M en la query (para acumular interés)", async () => {
    rentMock.findMany.mockResolvedValue([]); // PAID/WAIVED no los devuelve la query
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 6, 1) });
    expect(r.rentsUpdated).toBe(0);

    const findArg = rentMock.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; status: { in: string[] } };
    };
    expect(findArg.where.tenantId).toBe(TENANT);
    // OVERDUE_3M se incluye para seguir acumulando interés aunque su estado no avance.
    expect(findArg.where.status.in).toEqual([
      "PENDING",
      "DUE",
      "PARTIAL",
      "OVERDUE_1M",
      "OVERDUE_2M",
      "OVERDUE_3M",
    ]);
  });

  it("acumula interés moratorio en Rent.lateFeeAccrued sin cambiar el estado", async () => {
    // OVERDUE_2M con 5% mensual, 63 días vencido, 10000 de saldo:
    // 10000 × 0.05 × (63/30) = 1050.00
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 1, 1), "OVERDUE_2M", 0, 10000, 5, 0),
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) }); // 63 días
    expect(r.lateFeesUpdated).toBe(1);
    expect(r.rentsUpdated).toBe(0); // el estado OVERDUE_2M no cambia aún
    const call = rentMock.updateMany.mock.calls[0]?.[0] as {
      data: { lateFeeAccrued: Prisma.Decimal; status?: string };
    };
    expect(call.data.status).toBeUndefined();
    expect(call.data.lateFeeAccrued.toString()).toBe("1050");
  });

  it("CONGELA el interés devengado cuando el principal se salda con pagos (política CRT)", async () => {
    // Estaba con 800 de interés y ahora el principal quedó pagado completo:
    // el interés NO se limpia — queda congelado como cargo exigible aparte
    // (docs/decisiones-negocio-pendientes.md #1).
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 0, 1), "OVERDUE_2M", 10000, 10000, 5, 800),
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    // El fee no cambió (800 → 800): solo se persiste la transición de status.
    expect(r.lateFeesUpdated).toBe(0);
    const call = rentMock.updateMany.mock.calls[0]?.[0] as {
      data: { lateFeeAccrued?: Prisma.Decimal; status?: string };
    };
    expect(call.data.lateFeeAccrued).toBeUndefined();
    expect(call.data.status).toBe("PAID"); // saldado → PAID
  });

  it("SÍ limpia el interés cuando el principal se salda solo con condonación", async () => {
    // Condonación total sin pagos → el interés se perdona junto con la deuda.
    const row = rent("r1", utc(2026, 0, 1), "OVERDUE_2M", 0, 10000, 5, 800);
    row.amountWaived = D(10000);
    rentMock.findMany.mockResolvedValue([row]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(r.lateFeesUpdated).toBe(1);
    const call = rentMock.updateMany.mock.calls[0]?.[0] as {
      data: { lateFeeAccrued: Prisma.Decimal };
    };
    expect(call.data.lateFeeAccrued.toString()).toBe("0");
  });

  it("procesa varios rents con transiciones distintas en una sola corrida", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "DUE"), // 35d → OVERDUE_1M
      rent("r2", utc(2026, 1, 1), "OVERDUE_1M"), // 63d → OVERDUE_2M
      rent("r3", utc(2026, 3, 10), "PENDING"), // futuro → PENDING (no cambia)
      rent("r4", utc(2026, 3, 1), "PENDING", 10000), // pagado → PAID
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });

    expect(r.rentsUpdated).toBe(3); // r3 no cambió
    expect(r.byNewStatus.OVERDUE_1M).toBe(1);
    expect(r.byNewStatus.OVERDUE_2M).toBe(1);
    expect(r.byNewStatus.PAID).toBe(1);
    expect(r.overdueTransitions).toBe(2); // sólo OVERDUE_*
    expect(auditLogMock.create).toHaveBeenCalledTimes(2);
  });

  // --- Política de 2 meses: gating del recordatorio amable (1M) ---

  it("NO manda el recordatorio amable (1M) si el contrato no lo habilitó (default)", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "DUE"), // 35d → OVERDUE_1M, friendly off
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(r.byNewStatus.OVERDUE_1M).toBe(1);
    expect(mockSendRentReminder).not.toHaveBeenCalled(); // amable no se manda
    expect(auditLogMock.create).toHaveBeenCalledOnce(); // pero la transición sí se audita
  });

  it("SÍ manda el recordatorio amable (1M) si el contrato lo habilitó", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "DUE", 0, 10000, null, 0, true), // friendly on
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(mockSendRentReminder).toHaveBeenCalledWith(TENANT, "r1", "1M");
  });

  it("SIEMPRE manda el aviso fuerte de 2 meses (detonante), sin importar el flag amable", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 1, 1), "OVERDUE_1M"), // 63d → OVERDUE_2M, friendly off
    ]);
    const { updateRentStatuses } = await import(
      "@/server/services/rent-status-updater"
    );
    await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(mockSendRentReminder).toHaveBeenCalledWith(TENANT, "r1", "2M");
  });
});
