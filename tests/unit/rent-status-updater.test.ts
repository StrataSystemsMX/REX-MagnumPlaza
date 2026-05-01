import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const rentMock = {
  findMany: vi.fn(),
  updateMany: vi.fn(),
};
const auditLogMock = { create: vi.fn() };

vi.mock("@/lib/prisma/client", () => ({
  prisma: { rent: rentMock, auditLog: auditLogMock },
  prismaUnsafe: {},
}));

const mockSendRentReminder = vi.fn();
vi.mock("@/lib/services/notifications", () => ({
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
  dueDate: Date;
  status: string;
}

function rent(
  id: string,
  dueDate: Date,
  status: RentRow["status"],
  paid = 0,
  due = 10000,
): RentRow {
  return {
    id,
    contractId: `c-${id}`,
    amountDue: D(due),
    amountPaid: D(paid),
    dueDate,
    status,
  };
}

describe("updateRentStatuses", () => {
  it("DUE → OVERDUE_1M cuando pasa de 30 días vencido", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "DUE"), // 1 marzo 2026
    ]);
    const { updateRentStatuses } = await import(
      "@/lib/services/rent-status-updater"
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
      "@/lib/services/rent-status-updater"
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
      "@/lib/services/rent-status-updater"
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
      "@/lib/services/rent-status-updater"
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
      "@/lib/services/rent-status-updater"
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
      "@/lib/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });
    expect(r.byNewStatus.PAID).toBe(1);
    expect(r.overdueTransitions).toBe(0);
    expect(auditLogMock.create).not.toHaveBeenCalled(); // PAID no es OVERDUE
  });

  it("no toca PAID/WAIVED/OVERDUE_3M (vienen filtrados desde la query)", async () => {
    rentMock.findMany.mockResolvedValue([]); // simulación: la query del updater no los devuelve
    const { updateRentStatuses } = await import(
      "@/lib/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 6, 1) });
    expect(r.rentsUpdated).toBe(0);

    const findArg = rentMock.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; status: { in: string[] } };
    };
    expect(findArg.where.tenantId).toBe(TENANT);
    expect(findArg.where.status.in).toEqual([
      "PENDING",
      "DUE",
      "PARTIAL",
      "OVERDUE_1M",
      "OVERDUE_2M",
    ]);
  });

  it("procesa varios rents con transiciones distintas en una sola corrida", async () => {
    rentMock.findMany.mockResolvedValue([
      rent("r1", utc(2026, 2, 1), "DUE"), // 35d → OVERDUE_1M
      rent("r2", utc(2026, 1, 1), "OVERDUE_1M"), // 63d → OVERDUE_2M
      rent("r3", utc(2026, 3, 10), "PENDING"), // futuro → PENDING (no cambia)
      rent("r4", utc(2026, 3, 1), "PENDING", 10000), // pagado → PAID
    ]);
    const { updateRentStatuses } = await import(
      "@/lib/services/rent-status-updater"
    );
    const r = await updateRentStatuses(TENANT, { now: utc(2026, 3, 5) });

    expect(r.rentsUpdated).toBe(3); // r3 no cambió
    expect(r.byNewStatus.OVERDUE_1M).toBe(1);
    expect(r.byNewStatus.OVERDUE_2M).toBe(1);
    expect(r.byNewStatus.PAID).toBe(1);
    expect(r.overdueTransitions).toBe(2); // sólo OVERDUE_*
    expect(auditLogMock.create).toHaveBeenCalledTimes(2);
  });
});
