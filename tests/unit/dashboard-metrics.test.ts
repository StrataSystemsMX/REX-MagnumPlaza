import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  computeSummary,
  describeAuditLog,
  detectAlerts,
  lastNMonths,
  parseMonth,
} from "@/lib/services/dashboard-metrics-helpers";

const dec = (n: number | string) => new Prisma.Decimal(n);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("parseMonth", () => {
  it("parsea 'YYYY-MM' a un rango UTC del mes", () => {
    const r = parseMonth("2026-04");
    expect(r.month).toBe("2026-04");
    expect(r.periodStart.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(r.periodEnd.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("usa el mes actual cuando no se pasa nada", () => {
    const now = utc(2026, 6, 15);
    const r = parseMonth(undefined, now);
    expect(r.month).toBe("2026-07");
    expect(r.periodStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("ignora un input inválido y cae al mes actual", () => {
    const now = utc(2026, 0, 1);
    const r = parseMonth("invalid", now);
    expect(r.month).toBe("2026-01");
  });
});

describe("lastNMonths", () => {
  it("devuelve los últimos 6 meses inclusive del mes actual", () => {
    const months = lastNMonths(utc(2026, 3, 1), 6);
    expect(months).toHaveLength(6);
    const first = months[0];
    const last = months[5];
    if (!first || !last) throw new Error("Expected 6 months");
    expect(first.month).toBe("2025-11");
    expect(last.month).toBe("2026-04");
    expect(last.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(last.end.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("computeSummary", () => {
  it("calcula tasa de ocupación, ingreso esperado, cobrado y outstanding", () => {
    const r = computeSummary({
      totalProperties: 4,
      totalUnits: 10,
      occupiedUnits: 8,
      activeContracts: [
        { monthlyAmount: dec(10000) },
        { monthlyAmount: dec(15000) },
        { monthlyAmount: dec(20000) },
      ],
      expiringContracts: 1,
      expiringInsurance: 2,
      paymentsThisMonth: [{ amount: dec(10000) }, { amount: dec(5000) }],
      outstandingRents: [
        { amountDue: dec(15000), amountPaid: dec(10000), amountWaived: dec(0), status: "PARTIAL" },
        { amountDue: dec(20000), amountPaid: dec(0), amountWaived: dec(0), status: "OVERDUE_1M" },
        { amountDue: dec(20000), amountPaid: dec(0), amountWaived: dec(0), status: "OVERDUE_2M" },
        { amountDue: dec(20000), amountPaid: dec(0), amountWaived: dec(0), status: "OVERDUE_3M" },
      ],
    });

    expect(r.totalProperties).toBe(4);
    expect(r.totalUnits).toBe(10);
    expect(r.occupiedUnits).toBe(8);
    expect(r.vacantUnits).toBe(2);
    expect(r.occupancyRate).toBeCloseTo(0.8);
    expect(r.activeContracts).toBe(3);
    expect(r.contractsExpiringIn60Days).toBe(1);
    expect(r.insurancePoliciesExpiringSoon).toBe(2);
    expect(r.totalMonthlyExpectedIncome).toBe("45000");
    expect(r.totalCollectedThisMonth).toBe("15000");
    // 5000 + 20000 + 20000 + 20000 = 65000
    expect(r.totalOutstanding).toBe("65000");
    expect(r.overdueByLevel).toEqual({ "1M": 1, "2M": 1, "3M": 1 });
  });

  it("resta amountWaived del saldo pendiente (condonaciones)", () => {
    const r = computeSummary({
      totalProperties: 1,
      totalUnits: 2,
      occupiedUnits: 2,
      activeContracts: [{ monthlyAmount: dec(10000) }],
      expiringContracts: 0,
      expiringInsurance: 0,
      paymentsThisMonth: [],
      outstandingRents: [
        // Condonación parcial: saldo = 10000 - 2000 - 3000 = 5000
        { amountDue: dec(10000), amountPaid: dec(2000), amountWaived: dec(3000), status: "PARTIAL" },
        // Condonación total: saldo = 0, no debe sumar al outstanding
        { amountDue: dec(8000), amountPaid: dec(0), amountWaived: dec(8000), status: "PARTIAL" },
      ],
    });
    expect(r.totalOutstanding).toBe("5000");
  });

  it("devuelve 0 de ocupación cuando no hay unidades", () => {
    const r = computeSummary({
      totalProperties: 0,
      totalUnits: 0,
      occupiedUnits: 0,
      activeContracts: [],
      expiringContracts: 0,
      expiringInsurance: 0,
      paymentsThisMonth: [],
      outstandingRents: [],
    });
    expect(r.occupancyRate).toBe(0);
    expect(r.totalMonthlyExpectedIncome).toBe("0");
    expect(r.totalOutstanding).toBe("0");
  });
});

describe("detectAlerts", () => {
  const baseSummary = {
    totalProperties: 4,
    totalUnits: 10,
    occupiedUnits: 8,
    vacantUnits: 2,
    occupancyRate: 0.8,
    activeContracts: 3,
    contractsExpiringIn60Days: 0,
    insurancePoliciesExpiringSoon: 0,
    totalMonthlyExpectedIncome: "45000",
    totalCollectedThisMonth: "10000",
    totalOutstanding: "10000",
    overdueByLevel: { "1M": 0, "2M": 0, "3M": 0 },
  };

  it("alerta cuando la ocupación cae > 10 puntos", () => {
    const prev = { ...baseSummary, occupancyRate: 0.95 };
    const curr = { ...baseSummary, occupancyRate: 0.8 };
    const alerts = detectAlerts(curr, prev);
    expect(alerts.some((a) => a.message.includes("ocupación"))).toBe(true);
  });

  it("alerta cuando la cartera vencida crece > 20%", () => {
    const prev = { ...baseSummary, totalOutstanding: "10000" };
    const curr = { ...baseSummary, totalOutstanding: "15000" };
    const alerts = detectAlerts(curr, prev);
    expect(alerts.some((a) => a.message.includes("cartera vencida"))).toBe(true);
  });

  it("alerta crítica si hay rents en OVERDUE_3M", () => {
    const curr = { ...baseSummary, overdueByLevel: { "1M": 0, "2M": 0, "3M": 2 } };
    const alerts = detectAlerts(curr, baseSummary);
    expect(alerts.some((a) => a.level === "critical")).toBe(true);
  });

  it("alerta cuando hay pólizas de seguro por vencer", () => {
    const curr = { ...baseSummary, insurancePoliciesExpiringSoon: 3 };
    const alerts = detectAlerts(curr, baseSummary);
    const insuranceAlert = alerts.find((a) => a.message.includes("seguro"));
    expect(insuranceAlert).toBeDefined();
    expect(insuranceAlert?.level).toBe("warning");
    expect(insuranceAlert?.message).toContain("3");
  });

  it("no alerta cuando todo está estable", () => {
    expect(detectAlerts(baseSummary, baseSummary)).toEqual([]);
  });
});

describe("describeAuditLog", () => {
  it("formatea pago con monto y nombre del inquilino", () => {
    const desc = describeAuditLog(
      {
        id: "log1",
        createdAt: new Date(),
        action: "CREATE",
        entityType: "Payment",
        entityId: "pay1",
        changes: { amount: "10000" },
        user: { name: "Eli" },
      },
      new Map([["Payment:pay1", "a Sushi"]]),
    );
    expect(desc).toContain("Eli");
    expect(desc).toContain("$10,000");
    expect(desc).toContain("Sushi");
  });

  it("usa fallback genérico cuando no hay nombre asociado", () => {
    const desc = describeAuditLog(
      {
        id: "log2",
        createdAt: new Date(),
        action: "UPDATE",
        entityType: "Contract",
        entityId: "ctrx1234567890",
        changes: null,
        user: { name: "Leonardo" },
      },
      new Map(),
    );
    expect(desc).toContain("Leonardo");
    expect(desc).toContain("modificó");
    expect(desc).toContain("contrato");
  });

  it("usa 'Alguien' cuando no hay user", () => {
    const desc = describeAuditLog(
      {
        id: "log3",
        createdAt: new Date(),
        action: "CREATE",
        entityType: "Lessee",
        entityId: "l1",
        changes: null,
        user: null,
      },
      new Map([["Lessee:l1", "Acme S.A."]]),
    );
    expect(desc.startsWith("Alguien")).toBe(true);
  });
});
