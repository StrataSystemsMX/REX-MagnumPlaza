import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// ============================================================================
// Mocks
// ============================================================================

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();

const paymentMock = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
};
const rentMock = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
};
const auditLogMock = { create: vi.fn() };
const userRoleMock = { findFirst: vi.fn() };

const txMock = {
  payment: paymentMock,
  rent: rentMock,
};

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

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    payment: paymentMock,
    rent: rentMock,
    auditLog: auditLogMock,
    userRole: userRoleMock,
    $transaction: async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
  },
  prismaUnsafe: {},
}));

const mockSendPaymentConfirmation = vi.fn();
vi.mock("@/lib/services/notifications", () => ({
  sendPaymentConfirmation: (...args: unknown[]) => mockSendPaymentConfirmation(...args),
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
  mockRequirePermission.mockResolvedValue(undefined);
});

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function rentRow(amountDue: number) {
  return {
    amountDue: new Prisma.Decimal(amountDue),
    dueDate: utc(2026, 3, 1),
    status: "DUE" as const,
  };
}

// ============================================================================
// actionRegisterPayment
// ============================================================================

describe("actionRegisterPayment", () => {
  it("monto exacto deja la renta en PAID con amountPaid = amountDue", async () => {
    rentMock.findFirst.mockResolvedValue({ id: "rent-1" });
    paymentMock.create.mockResolvedValue({ id: "pay-1" });
    paymentMock.findMany.mockResolvedValue([{ amount: 10000 }]);
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(10000));

    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const result = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 10000,
      paymentDate: utc(2026, 3, 5),
      method: "TRANSFER",
    });

    expect(result.rentStatus).toBe("PAID");
    expect(rentMock.updateMany).toHaveBeenCalledOnce();
    const arg = rentMock.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
      data: { amountPaid: Prisma.Decimal; status: string };
    };
    expect(arg.where).toEqual({ id: "rent-1", tenantId: TENANT });
    expect(arg.data.status).toBe("PAID");
    expect(arg.data.amountPaid.toString()).toBe("10000");
    expect(auditLogMock.create).toHaveBeenCalledOnce();
  });

  it("monto parcial deja la renta en PARTIAL con amountPaid actualizado", async () => {
    rentMock.findFirst.mockResolvedValue({ id: "rent-1" });
    paymentMock.create.mockResolvedValue({ id: "pay-1" });
    paymentMock.findMany.mockResolvedValue([{ amount: 4000 }]);
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(10000));

    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const result = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 4000,
      paymentDate: utc(2026, 3, 5),
      method: "CASH",
    });

    expect(result.rentStatus).toBe("PARTIAL");
    const arg = rentMock.updateMany.mock.calls[0]?.[0] as {
      data: { amountPaid: Prisma.Decimal; status: string };
    };
    expect(arg.data.status).toBe("PARTIAL");
    expect(arg.data.amountPaid.toString()).toBe("4000");
  });

  it("dos pagos parciales que suman el total terminan en PAID", async () => {
    // Primer pago: 6000 sobre amountDue=10000 → PARTIAL
    rentMock.findFirst.mockResolvedValue({ id: "rent-1" });
    paymentMock.create.mockResolvedValue({ id: "pay-1" });
    paymentMock.findMany.mockResolvedValue([{ amount: 6000 }]);
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(10000));

    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const r1 = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 6000,
      paymentDate: utc(2026, 3, 5),
      method: "TRANSFER",
    });
    expect(r1.rentStatus).toBe("PARTIAL");

    // Segundo pago: 4000. La suma de Payments en findMany incluye los dos.
    paymentMock.create.mockResolvedValue({ id: "pay-2" });
    paymentMock.findMany.mockResolvedValue([{ amount: 6000 }, { amount: 4000 }]);

    const r2 = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 4000,
      paymentDate: utc(2026, 3, 10),
      method: "TRANSFER",
    });
    expect(r2.rentStatus).toBe("PAID");
    const lastUpdate = rentMock.updateMany.mock.calls.at(-1)?.[0] as {
      data: { status: string; amountPaid: Prisma.Decimal };
    };
    expect(lastUpdate.data.status).toBe("PAID");
    expect(lastUpdate.data.amountPaid.toString()).toBe("10000");
  });

  it("falla si la renta no pertenece al tenant", async () => {
    rentMock.findFirst.mockResolvedValue(null);
    const { actionRegisterPayment } = await import("@/lib/services/payments");
    await expect(
      actionRegisterPayment({
        rentId: "rent-x",
        amount: 1000,
        paymentDate: utc(2026, 3, 5),
        method: "CASH",
      }),
    ).rejects.toThrow(/no encontrada/i);
    expect(paymentMock.create).not.toHaveBeenCalled();
  });

  it("respeta WAIVED: no recalcula a otro estado aunque haya pago", async () => {
    rentMock.findFirst.mockResolvedValue({ id: "rent-1" });
    paymentMock.create.mockResolvedValue({ id: "pay-1" });
    paymentMock.findMany.mockResolvedValue([{ amount: 5000 }]);
    rentMock.findFirstOrThrow.mockResolvedValue({
      ...rentRow(10000),
      status: "WAIVED" as const,
    });
    const { actionRegisterPayment } = await import("@/lib/services/payments");
    const r = await actionRegisterPayment({
      rentId: "rent-1",
      amount: 5000,
      paymentDate: utc(2026, 3, 5),
      method: "CASH",
    });
    expect(r.rentStatus).toBe("WAIVED");
  });
});

// ============================================================================
// actionRegisterBulkPayment
// ============================================================================

describe("actionRegisterBulkPayment", () => {
  it("crea N Payments y deja N Rents en PAID cuando los montos coinciden", async () => {
    rentMock.findMany.mockResolvedValueOnce([
      { id: "rent-1" },
      { id: "rent-2" },
      { id: "rent-3" },
    ]);
    paymentMock.create
      .mockResolvedValueOnce({ id: "pay-1" })
      .mockResolvedValueOnce({ id: "pay-2" })
      .mockResolvedValueOnce({ id: "pay-3" });
    // Cada llamada a findMany dentro de recalc devuelve sólo el pago de ese rent.
    paymentMock.findMany
      .mockResolvedValueOnce([{ amount: 10000 }])
      .mockResolvedValueOnce([{ amount: 10000 }])
      .mockResolvedValueOnce([{ amount: 10000 }]);
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(10000));

    const { actionRegisterBulkPayment } = await import("@/lib/services/payments");
    const result = await actionRegisterBulkPayment({
      lesseeId: "lessee-1",
      amount: 30000,
      paymentDate: utc(2026, 3, 5),
      method: "TRANSFER",
      reference: "TRF-BULK-001",
      splitByRent: [
        { rentId: "rent-1", amount: 10000 },
        { rentId: "rent-2", amount: 10000 },
        { rentId: "rent-3", amount: 10000 },
      ],
    });

    expect(result.payments).toHaveLength(3);
    expect(result.rentsUpdated).toBe(3);
    expect(paymentMock.create).toHaveBeenCalledTimes(3);
    expect(rentMock.updateMany).toHaveBeenCalledTimes(3);
    // Cada update dejó la renta en PAID
    for (const call of rentMock.updateMany.mock.calls) {
      expect((call[0] as { data: { status: string } }).data.status).toBe("PAID");
    }
    expect(auditLogMock.create).toHaveBeenCalledTimes(3);
  });

  it("falla si la suma del split no coincide con el monto", async () => {
    const { actionRegisterBulkPayment } = await import("@/lib/services/payments");
    await expect(
      actionRegisterBulkPayment({
        lesseeId: "lessee-1",
        amount: 30000,
        paymentDate: utc(2026, 3, 5),
        method: "TRANSFER",
        splitByRent: [
          { rentId: "rent-1", amount: 10000 },
          { rentId: "rent-2", amount: 10000 },
        ],
      }),
    ).rejects.toThrow();
    expect(paymentMock.create).not.toHaveBeenCalled();
  });

  it("falla si alguna renta no pertenece al inquilino", async () => {
    rentMock.findMany.mockResolvedValueOnce([{ id: "rent-1" }]); // sólo encuentra 1 de 2
    const { actionRegisterBulkPayment } = await import("@/lib/services/payments");
    await expect(
      actionRegisterBulkPayment({
        lesseeId: "lessee-1",
        amount: 20000,
        paymentDate: utc(2026, 3, 5),
        method: "TRANSFER",
        splitByRent: [
          { rentId: "rent-1", amount: 10000 },
          { rentId: "rent-2", amount: 10000 },
        ],
      }),
    ).rejects.toThrow(/no pertenecen/i);
    expect(paymentMock.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// actionDeletePayment
// ============================================================================

describe("actionDeletePayment", () => {
  it("borra el pago y recalcula la renta", async () => {
    paymentMock.findFirst.mockResolvedValue({
      id: "pay-1",
      rentId: "rent-1",
      amount: new Prisma.Decimal(5000),
      paymentDate: utc(2026, 3, 5),
      method: "TRANSFER",
    });
    paymentMock.findMany.mockResolvedValue([]); // ya no hay pagos tras el delete
    rentMock.findFirstOrThrow.mockResolvedValue(rentRow(10000));

    const { actionDeletePayment } = await import("@/lib/services/payments");
    await actionDeletePayment("pay-1");

    expect(paymentMock.deleteMany).toHaveBeenCalledOnce();
    expect(rentMock.updateMany).toHaveBeenCalledOnce();
    const arg = rentMock.updateMany.mock.calls[0]?.[0] as {
      data: { status: string; amountPaid: Prisma.Decimal };
    };
    // Sin pagos y vencido → DUE/OVERDUE_X (depende de now real). Asegurar que NO está PAID/PARTIAL.
    expect(["DUE", "OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"]).toContain(arg.data.status);
    expect(arg.data.amountPaid.toString()).toBe("0");
  });

  it("PermissionError si el user no es MASTER", async () => {
    mockRequirePermission.mockImplementation(async (_u, code: string) => {
      const { PermissionError } = await import("@/lib/auth/permissions");
      throw new PermissionError(code);
    });
    const { actionDeletePayment } = await import("@/lib/services/payments");
    await expect(actionDeletePayment("pay-1")).rejects.toMatchObject({
      name: "PermissionError",
      code: "payment.delete",
    });
  });
});
