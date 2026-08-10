import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { calculateLateFee } from "@/server/services/late-fees";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("calculateLateFee", () => {
  it("0 cuando el contrato no tiene lateFeePercentage", () => {
    const r = calculateLateFee(
      {
        amountDue: 10000,
        amountPaid: 0,
        dueDate: utc(2026, 0, 1),
        status: "OVERDUE_2M",
      },
      { lateFeePercentage: null },
      utc(2026, 3, 1),
    );
    expect(r.amount.toString()).toBe("0");
  });

  it("0 si el rent ya está PAID", () => {
    const r = calculateLateFee(
      {
        amountDue: 10000,
        amountPaid: 10000,
        dueDate: utc(2026, 0, 1),
        status: "PAID",
      },
      { lateFeePercentage: 5 },
      utc(2026, 3, 1),
    );
    expect(r.amount.toString()).toBe("0");
  });

  it("0 si todavía no ha vencido", () => {
    const r = calculateLateFee(
      {
        amountDue: 10000,
        amountPaid: 0,
        dueDate: utc(2026, 5, 1),
        status: "PENDING",
      },
      { lateFeePercentage: 5 },
      utc(2026, 3, 1),
    );
    expect(r.amount.toString()).toBe("0");
  });

  it("calcula sobre el saldo pendiente con prorrateo diario al 5% mensual", () => {
    // 30 días vencido = 1 mes. 5% × 10000 = 500.
    const r = calculateLateFee(
      {
        amountDue: 10000,
        amountPaid: 0,
        dueDate: utc(2026, 2, 1),
        status: "OVERDUE_1M",
      },
      { lateFeePercentage: 5 },
      utc(2026, 2, 31),
    );
    expect(r.daysOverdue).toBe(30);
    expect(new Prisma.Decimal(r.amount).toFixed(2)).toBe("500.00");
  });

  it("toma sólo el saldo pendiente (amountDue - amountPaid)", () => {
    // 60 días vencido (= 2 meses), saldo = 4000, 5% mensual → 4000 × 5% × 2 = 400.
    const r = calculateLateFee(
      {
        amountDue: 10000,
        amountPaid: 6000,
        dueDate: utc(2026, 2, 1),
        status: "PARTIAL",
      },
      { lateFeePercentage: 5 },
      utc(2026, 3, 30),
    );
    expect(r.daysOverdue).toBe(60);
    expect(new Prisma.Decimal(r.amount).toFixed(2)).toBe("400.00");
  });
});
