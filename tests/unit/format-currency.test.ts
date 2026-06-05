import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { formatMXN, formatMXNCompact, formatPercent } from "@/lib/format-currency";

// El espacio entre el símbolo y el número que produce Intl en es-MX es un
// NBSP ( ), no un espacio normal. Normalizamos para aserciones legibles.
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatMXN", () => {
  it("0 decimales por defecto (redondea)", () => {
    expect(norm(formatMXN(1234.56))).toBe("$1,235");
    expect(norm(formatMXN(1234.4))).toBe("$1,234");
  });

  it("2 decimales cuando se pide", () => {
    expect(norm(formatMXN(1234.5, 2))).toBe("$1,234.50");
  });

  it("1 decimal", () => {
    expect(norm(formatMXN(1234.56, 1))).toBe("$1,234.6");
  });

  it("acepta string", () => {
    expect(norm(formatMXN("1234.50", 2))).toBe("$1,234.50");
  });

  it("acepta Prisma.Decimal", () => {
    expect(norm(formatMXN(new Prisma.Decimal("9999.99"), 2))).toBe("$9,999.99");
  });

  it("montos negativos (saldos a favor / devoluciones)", () => {
    expect(norm(formatMXN(-500, 2))).toBe("-$500.00");
  });

  it("cero", () => {
    expect(norm(formatMXN(0))).toBe("$0");
  });
});

describe("formatMXNCompact", () => {
  // La posición del símbolo ($) en notación compacta depende del build de ICU,
  // así que verificamos contenido (magnitud + sufijo) sin fijar el orden.
  it("compacta millones", () => {
    const out = norm(formatMXNCompact(1_200_000));
    expect(out).toContain("$");
    expect(out).toMatch(/1\.2\s*M/);
  });

  it("compacta miles", () => {
    const out = norm(formatMXNCompact(1500));
    expect(out).toContain("$");
    expect(out).toMatch(/1\.5\s*k/);
  });
});

describe("formatPercent", () => {
  it("fracción a porcentaje con 1 decimal por defecto", () => {
    expect(norm(formatPercent(0.155))).toBe("15.5%");
  });

  it("sin decimales cuando se pide", () => {
    expect(norm(formatPercent(0.15, 0))).toBe("15%");
  });
});
