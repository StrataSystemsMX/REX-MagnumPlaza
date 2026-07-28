import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  buildPeriod,
  computeAvgResolutionDays,
  computeAvgVacancyDays,
  computeCollectionRate,
  computeMaintenanceCostPerSqm,
  computeMrr,
  computeOccupancyRate,
  computeOverdueRate,
  computeRenewalRate,
  computeRoi,
  computeTenantTurnover,
  renewalCandidateWindow,
} from "@/lib/services/kpi-queries-helpers";

const dec = (n: number | string) => new Prisma.Decimal(n);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe("buildPeriod", () => {
  it("arma el rango del año completo cuando no se pasa mes", () => {
    const p = buildPeriod(2026, undefined, utc(2026, 11, 15));
    expect(p.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("arma el rango de un mes específico", () => {
    const p = buildPeriod(2026, 4, utc(2026, 11, 15));
    expect(p.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("cutoff es 'ahora' cuando el periodo aún no termina", () => {
    const now = utc(2026, 3, 15);
    const p = buildPeriod(2026, 4, now);
    expect(p.cutoff.getTime()).toBe(now.getTime());
  });

  it("cutoff es el fin del periodo cuando ya pasó", () => {
    const now = utc(2026, 6, 1);
    const p = buildPeriod(2026, 4, now);
    expect(p.cutoff.toISOString()).toBe(p.end.toISOString());
  });
});

describe("computeOccupancyRate", () => {
  it("devuelve null sin unidades", () => {
    expect(computeOccupancyRate([])).toBeNull();
  });

  it("calcula el % rentado y el detalle", () => {
    const r = computeOccupancyRate([
      { status: "RENTADA" },
      { status: "RENTADA" },
      { status: "DISPONIBLE" },
    ]);
    expect(r?.raw).toBeCloseTo(66.666, 1);
    expect(r?.formatted).toBe("67%");
    expect(r?.detail).toBe("2 de 3 locales rentados");
  });

  it("status good/warning/bad según umbral", () => {
    const make = (rented: number, total: number) =>
      computeOccupancyRate([
        ...Array(rented).fill({ status: "RENTADA" }),
        ...Array(total - rented).fill({ status: "DISPONIBLE" }),
      ]);
    expect(make(9, 10)?.status).toBe("good"); // 90% >= 80%
    expect(make(7, 10)?.status).toBe("warning"); // 70% >= 60%
    expect(make(5, 10)?.status).toBe("bad"); // 50% < 60%
  });
});

describe("computeAvgVacancyDays", () => {
  it("devuelve null sin contratos nuevos", () => {
    expect(computeAvgVacancyDays([], [])).toBeNull();
  });

  it("devuelve null cuando ningún contrato nuevo tiene un contrato previo terminado antes", () => {
    const r = computeAvgVacancyDays(
      [{ unitId: "u1", startDate: utc(2026, 3, 1) }],
      [],
    );
    expect(r).toBeNull();
  });

  it("calcula el gap en días entre el fin del contrato previo y el inicio del nuevo", () => {
    const r = computeAvgVacancyDays(
      [{ unitId: "u1", startDate: utc(2026, 3, 1) }],
      [{ unitId: "u1", endDate: utc(2026, 2, 1) }], // 31 días antes
    );
    expect(r?.raw).toBe(31);
    expect(r?.formatted).toBe("31 días");
    expect(r?.detail).toBe("Promedio de 1 transiciones");
  });

  it("ignora gaps negativos (contrato previo termina después del nuevo)", () => {
    const r = computeAvgVacancyDays(
      [{ unitId: "u1", startDate: utc(2026, 3, 1) }],
      [{ unitId: "u1", endDate: utc(2026, 3, 15) }],
    );
    expect(r).toBeNull();
  });

  it("ignora gaps absurdos de más de 730 días", () => {
    const r = computeAvgVacancyDays(
      [{ unitId: "u1", startDate: utc(2028, 3, 1) }],
      [{ unitId: "u1", endDate: utc(2026, 3, 1) }],
    );
    expect(r).toBeNull();
  });

  it("status good/warning/bad según umbral de días", () => {
    const build = (gapDays: number) =>
      computeAvgVacancyDays(
        [{ unitId: "u1", startDate: utc(2026, 6, 1) }],
        [{ unitId: "u1", endDate: new Date(utc(2026, 6, 1).getTime() - days(gapDays)) }],
      );
    expect(build(20)?.status).toBe("good");
    expect(build(60)?.status).toBe("warning");
    expect(build(120)?.status).toBe("bad");
  });
});

describe("computeMrr", () => {
  it("devuelve null sin contratos activos", () => {
    expect(computeMrr([])).toBeNull();
  });

  it("suma monthlyAmount de todos los contratos", () => {
    const r = computeMrr([{ monthlyAmount: dec(10000) }, { monthlyAmount: dec(15000) }]);
    expect(r?.raw).toBe(25000);
    expect(r?.detail).toBe("2 contratos activos");
    expect(r?.status).toBe("neutral");
  });

  it("usa singular cuando hay un solo contrato", () => {
    const r = computeMrr([{ monthlyAmount: dec(10000) }]);
    expect(r?.detail).toBe("1 contrato activo");
  });
});

describe("computeCollectionRate", () => {
  it("devuelve null sin rentas", () => {
    expect(computeCollectionRate([])).toBeNull();
  });

  it("calcula el % pagado", () => {
    const r = computeCollectionRate([
      { status: "PAID" },
      { status: "PAID" },
      { status: "PAID" },
      { status: "OVERDUE_1M" },
    ]);
    expect(r?.raw).toBe(75);
    expect(r?.detail).toBe("3 de 4 rentas cobradas");
    expect(r?.status).toBe("warning"); // 75% >= 75% pero < 90%
  });

  it("status good cuando >= 90%", () => {
    const r = computeCollectionRate(Array(10).fill({ status: "PAID" }));
    expect(r?.status).toBe("good");
  });

  it("status bad cuando < 75%", () => {
    const r = computeCollectionRate([
      { status: "PAID" },
      { status: "OVERDUE_1M" },
      { status: "OVERDUE_1M" },
      { status: "OVERDUE_1M" },
    ]);
    expect(r?.status).toBe("bad");
  });
});

describe("computeOverdueRate", () => {
  it("devuelve null sin rentas", () => {
    expect(computeOverdueRate([])).toBeNull();
  });

  it("calcula el % de cartera vencida sobre lo facturado", () => {
    const r = computeOverdueRate([
      { amountDue: dec(10000), amountPaid: dec(10000), status: "PAID" },
      { amountDue: dec(10000), amountPaid: dec(0), status: "OVERDUE_1M" },
    ]);
    // 10000 vencido / 20000 facturado = 50%
    expect(r?.raw).toBe(50);
    expect(r?.formatted).toBe("50.0%");
    expect(r?.detail).toBe("$10,000 vencido");
  });

  it("no cuenta como vencido un status que no está en la lista de mora", () => {
    const r = computeOverdueRate([
      { amountDue: dec(10000), amountPaid: dec(5000), status: "PARTIAL" },
    ]);
    expect(r?.raw).toBe(0);
  });

  it("no deja el balance vencido en negativo si amountPaid > amountDue", () => {
    const r = computeOverdueRate([
      { amountDue: dec(10000), amountPaid: dec(12000), status: "DUE" },
    ]);
    expect(r?.raw).toBe(0);
  });

  it("status good/warning/bad según umbral", () => {
    const build = (overdue: number, billed: number) =>
      computeOverdueRate([
        { amountDue: dec(overdue), amountPaid: dec(0), status: "DUE" },
        { amountDue: dec(billed - overdue), amountPaid: dec(billed - overdue), status: "PAID" },
      ]);
    expect(build(3, 100)?.status).toBe("good"); // 3%
    expect(build(10, 100)?.status).toBe("warning"); // 10%
    expect(build(20, 100)?.status).toBe("bad"); // 20%
  });
});

describe("computeTenantTurnover", () => {
  it("devuelve null cuando no hay contratos activos ni terminados", () => {
    expect(computeTenantTurnover(0, 0)).toBeNull();
  });

  it("calcula el % de rotación sobre la base activos+terminados", () => {
    const r = computeTenantTurnover(2, 8);
    expect(r?.raw).toBe(20);
    expect(r?.detail).toBe("2 inquilinos salieron");
  });

  it("no pluraliza 'inquilino' cuando sale uno solo", () => {
    const r = computeTenantTurnover(1, 9);
    expect(r?.detail).toBe("1 inquilino salieron");
  });

  it("status good/warning/bad según umbral", () => {
    expect(computeTenantTurnover(1, 9)?.status).toBe("good"); // 10%
    expect(computeTenantTurnover(3, 7)?.status).toBe("warning"); // 30%
    expect(computeTenantTurnover(5, 5)?.status).toBe("bad"); // 50%
  });
});

describe("computeMaintenanceCostPerSqm", () => {
  it("devuelve null sin área rentable", () => {
    expect(computeMaintenanceCostPerSqm([{ cost: dec(1000) }], 0)).toBeNull();
  });

  it("devuelve null sin mantenimientos", () => {
    expect(computeMaintenanceCostPerSqm([], 100)).toBeNull();
  });

  it("calcula el costo por m²", () => {
    const r = computeMaintenanceCostPerSqm([{ cost: dec(1000) }, { cost: dec(500) }], 100);
    expect(r?.raw).toBe(15);
  });

  it("status good/warning/bad según umbral", () => {
    expect(computeMaintenanceCostPerSqm([{ cost: dec(3000) }], 100)?.status).toBe("good"); // 30/m2
    expect(computeMaintenanceCostPerSqm([{ cost: dec(10000) }], 100)?.status).toBe("warning"); // 100/m2
    expect(computeMaintenanceCostPerSqm([{ cost: dec(20000) }], 100)?.status).toBe("bad"); // 200/m2
  });
});

describe("computeRoi", () => {
  const period = { start: utc(2026, 0, 1), end: utc(2026, 1, 1), cutoff: utc(2026, 0, 31) };

  it("devuelve null cuando no hay ingreso esperado (sin contratos activos)", () => {
    expect(computeRoi([], [], [], period)).toBeNull();
  });

  it("calcula el ROI como (ingresos - gastos) / ingreso esperado", () => {
    // 1 mes casi completo (30/31 días) → monthsElapsed ~ 0.985, redondeado por Math.max(1, ...) no aplica porque > 1? en realidad 30/30.44 < 1 → usa max(1, x) = 1
    const r = computeRoi(
      [{ amount: dec(9000) }],
      [{ cost: dec(1000) }],
      [{ monthlyAmount: dec(10000) }],
      period,
    );
    // expectedIncome = 10000 * max(1, ~0.985) = 10000
    // roi = (9000 - 1000) / 10000 = 0.8
    expect(r?.raw).toBe(80);
    expect(r?.status).toBe("warning"); // 80% >= 70% pero < 85%
  });

  it("status good cuando roi >= 85%", () => {
    const r = computeRoi([{ amount: dec(10000) }], [], [{ monthlyAmount: dec(10000) }], period);
    expect(r?.status).toBe("good");
  });

  it("status bad cuando roi < 70%", () => {
    const r = computeRoi([{ amount: dec(5000) }], [], [{ monthlyAmount: dec(10000) }], period);
    expect(r?.status).toBe("bad");
  });
});

describe("computeRenewalRate", () => {
  it("devuelve null sin contratos vencidos", () => {
    expect(computeRenewalRate([], [])).toBeNull();
  });

  it("cuenta como renovado un contrato con un nuevo contrato en la misma unidad dentro de 45 días", () => {
    const r = computeRenewalRate(
      [{ unitId: "u1", endDate: utc(2026, 3, 1) }],
      [{ unitId: "u1", startDate: utc(2026, 3, 10) }],
    );
    expect(r?.raw).toBe(100);
    expect(r?.detail).toBe("1 de 1 contratos renovados");
  });

  it("no cuenta como renovado si el nuevo contrato es de otra unidad", () => {
    const r = computeRenewalRate(
      [{ unitId: "u1", endDate: utc(2026, 3, 1) }],
      [{ unitId: "u2", startDate: utc(2026, 3, 10) }],
    );
    expect(r?.raw).toBe(0);
  });

  it("no cuenta como renovado si el nuevo contrato empieza más de 45 días después", () => {
    const r = computeRenewalRate(
      [{ unitId: "u1", endDate: utc(2026, 0, 1) }],
      [{ unitId: "u1", startDate: new Date(utc(2026, 0, 1).getTime() + days(46)) }],
    );
    expect(r?.raw).toBe(0);
  });

  it("status good/warning/bad según umbral", () => {
    const renewals = [
      { unitId: "u1", startDate: utc(2026, 0, 2) },
      { unitId: "u2", startDate: utc(2026, 0, 2) },
    ];
    const expired8 = [
      { unitId: "u1", endDate: utc(2026, 0, 1) },
      { unitId: "u2", endDate: utc(2026, 0, 1) },
      ...Array.from({ length: 8 }, (_, i) => ({ unitId: `x${i}`, endDate: utc(2026, 0, 1) })),
    ];
    expect(computeRenewalRate(expired8, renewals)?.status).toBe("bad"); // 2/10 = 20%
  });
});

describe("renewalCandidateWindow", () => {
  it("devuelve null sin contratos vencidos", () => {
    expect(renewalCandidateWindow([])).toBeNull();
  });

  it("calcula la ventana desde el endDate más temprano hasta el más tardío + 45 días", () => {
    const w = renewalCandidateWindow([
      { unitId: "u1", endDate: utc(2026, 0, 10) },
      { unitId: "u2", endDate: utc(2026, 0, 1) },
    ]);
    expect(w?.start.toISOString()).toBe(utc(2026, 0, 1).toISOString());
    expect(w?.end.getTime()).toBe(utc(2026, 0, 10).getTime() + days(45));
  });
});

describe("computeAvgResolutionDays", () => {
  it("devuelve null sin mantenimientos completados", () => {
    expect(computeAvgResolutionDays([{ createdAt: utc(2026, 0, 1), completedDate: null }])).toBeNull();
  });

  it("calcula días promedio entre creación y finalización", () => {
    const r = computeAvgResolutionDays([
      { createdAt: utc(2026, 0, 1), completedDate: utc(2026, 0, 6) }, // 5 días
      { createdAt: utc(2026, 0, 1), completedDate: utc(2026, 0, 11) }, // 10 días
    ]);
    expect(r?.raw).toBe(8); // promedio 7.5 redondeado a 8
    expect(r?.detail).toBe("2 mantenimientos completados");
  });

  it("status good/warning/bad según umbral", () => {
    const one = (d: number) =>
      computeAvgResolutionDays([
        { createdAt: utc(2026, 0, 1), completedDate: new Date(utc(2026, 0, 1).getTime() + days(d)) },
      ]);
    expect(one(3)?.status).toBe("good");
    expect(one(15)?.status).toBe("warning");
    expect(one(45)?.status).toBe("bad");
  });
});
