import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMonthShort,
  formatPeriodLong,
  formatPeriodShort,
} from "@/shared/format-date";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("formatPeriodLong", () => {
  it("mes completo capitalizado + año", () => {
    expect(formatPeriodLong(utc(2026, 4, 1))).toBe("Mayo de 2026");
  });

  it("acepta string ISO", () => {
    expect(formatPeriodLong("2026-01-15")).toBe("Enero de 2026");
  });

  it("UTC: no se corre de día/mes por zona local", () => {
    // 2026-03-01T00:00:00Z debe seguir siendo marzo, no febrero.
    expect(formatPeriodLong("2026-03-01")).toBe("Marzo de 2026");
  });
});

describe("formatPeriodShort", () => {
  it("mes abreviado capitalizado + año", () => {
    expect(formatPeriodShort(utc(2026, 4, 1))).toMatch(/^May\.? 2026$/);
  });
});

describe("formatDate", () => {
  it("día + mes abreviado + año", () => {
    expect(formatDate(utc(2026, 4, 5))).toMatch(/^05 may\.? 2026$/);
  });
});

describe("formatMonthShort", () => {
  it("solo mes abreviado, capitalizado", () => {
    expect(formatMonthShort(utc(2026, 4, 1))).toMatch(/^May\.?$/);
  });
});
