import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { computeRentStatus, daysOverdue } from "@/lib/services/rent-status";

const D = (n: number | string) => new Prisma.Decimal(n);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("computeRentStatus", () => {
  const dueDate = utc(2026, 3, 1); // 1 abril 2026

  it("PAID cuando amountPaid == amountDue", () => {
    expect(computeRentStatus(D(10000), D(10000), dueDate, utc(2026, 3, 15))).toBe("PAID");
  });

  it("PAID cuando amountPaid > amountDue (pago en exceso)", () => {
    expect(computeRentStatus(D(11000), D(10000), dueDate, utc(2026, 3, 15))).toBe("PAID");
  });

  it("PARTIAL cuando 0 < amountPaid < amountDue", () => {
    expect(computeRentStatus(D(5000), D(10000), dueDate, utc(2026, 3, 15))).toBe("PARTIAL");
  });

  it("PENDING cuando amountPaid==0 y dueDate en el futuro", () => {
    expect(computeRentStatus(D(0), D(10000), dueDate, utc(2026, 2, 15))).toBe("PENDING");
  });

  it("DUE cuando amountPaid==0 y vencido < 30 días", () => {
    expect(computeRentStatus(D(0), D(10000), dueDate, utc(2026, 3, 15))).toBe("DUE");
  });

  it("OVERDUE_1M cuando vencido entre 30 y 59 días", () => {
    expect(computeRentStatus(D(0), D(10000), dueDate, utc(2026, 4, 5))).toBe("OVERDUE_1M");
  });

  it("OVERDUE_2M cuando vencido entre 60 y 89 días", () => {
    expect(computeRentStatus(D(0), D(10000), dueDate, utc(2026, 5, 5))).toBe("OVERDUE_2M");
  });

  it("OVERDUE_3M cuando vencido ≥ 90 días", () => {
    expect(computeRentStatus(D(0), D(10000), dueDate, utc(2026, 6, 5))).toBe("OVERDUE_3M");
  });
});

describe("daysOverdue", () => {
  it("0 cuando dueDate == now", () => {
    expect(daysOverdue(utc(2026, 3, 1), utc(2026, 3, 1))).toBe(0);
  });

  it("positivo cuando ya venció", () => {
    expect(daysOverdue(utc(2026, 3, 1), utc(2026, 3, 11))).toBe(10);
  });

  it("negativo cuando aún no vence", () => {
    expect(daysOverdue(utc(2026, 3, 11), utc(2026, 3, 1))).toBe(-10);
  });
});
