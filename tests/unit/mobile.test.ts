import { describe, expect, it } from "vitest";
import { contractPill } from "@/components/mobile/MobileUI";
import {
  collectionTone,
  initials,
  isPayableStatus,
  propertyAbbr,
  rentSeverity,
  shortPropertyName,
} from "@/shared/mobile/format";
import { parseAmountInput, todayDateInput } from "@/shared/mobile/input";
import { activeTab, backTarget, withOrigin } from "@/shared/mobile/nav";
import type { RentStatus } from "@/generated/prisma/enums";
import {
  createMaintenanceSchema,
  updateMaintenanceStatusSchema,
} from "@/shared/validators/maintenance";

describe("mobile/format", () => {
  it("acorta nombres de plaza", () => {
    expect(shortPropertyName("Plaza Magnum Progreso")).toBe("Progreso");
    expect(shortPropertyName("Plaza Quiroga 1")).toBe("Quiroga 1");
    expect(shortPropertyName("Inbursa Blvd Kino")).toBe("Inbursa Blvd Kino");
  });

  it("abrevia para el tile del local", () => {
    expect(propertyAbbr("Plaza Magnum Progreso")).toBe("Progr");
    expect(propertyAbbr("Plaza Quiroga 2")).toBe("Quir 2");
    expect(propertyAbbr("La Chila Garmendia")).toBe("Chila");
    expect(propertyAbbr("Nayarit 52")).toBe("Naya 52");
  });

  it("saca iniciales ignorando puntuación y conectores de 1 letra", () => {
    expect(initials("Goyoma S.A. de C.V.")).toBe("GO");
    expect(initials("Farmacias Benavides S.A.B de C.V.")).toBe("FB");
    expect(initials("Aaron Oviedo")).toBe("AO");
    expect(initials("7-Eleven México")).toBe("7E");
    expect(initials("")).toBe("?");
  });

  it("ordena la cobranza de lo más grave a lo pagado", () => {
    const statuses: RentStatus[] = ["PAID", "PENDING", "OVERDUE_1M", "PARTIAL", "OVERDUE_3M", "DUE", "OVERDUE_2M"];
    expect([...statuses].sort((a, b) => rentSeverity(a) - rentSeverity(b))).toEqual([
      "OVERDUE_3M",
      "OVERDUE_2M",
      "OVERDUE_1M",
      "DUE",
      "PARTIAL",
      "PENDING",
      "PAID",
    ]);
  });

  it("solo PAID y WAIVED dejan de ser cobrables", () => {
    expect(isPayableStatus("PAID")).toBe(false);
    expect(isPayableStatus("WAIVED")).toBe(false);
    expect(isPayableStatus("PARTIAL")).toBe(true);
    expect(isPayableStatus("OVERDUE_3M")).toBe(true);
  });

  it("usa los mismos umbrales de cobranza que el dashboard web", () => {
    expect(collectionTone(90).text).toBe("text-emerald-600");
    expect(collectionTone(89).text).toBe("text-blue-600");
    expect(collectionTone(70).text).toBe("text-blue-600");
    expect(collectionTone(50).text).toBe("text-amber-600");
    expect(collectionTone(49).text).toBe("text-rose-600");
  });
});

describe("contractPill", () => {
  it("marca por renovar a ≤60 días del vencimiento", () => {
    expect(contractPill({ status: "ACTIVE", daysToExpire: 61 }).label).toBe("Activo");
    expect(contractPill({ status: "ACTIVE", daysToExpire: 60 }).label).toBe("Por renovar");
    expect(contractPill({ status: "ACTIVE", daysToExpire: 0 }).label).toBe("Por renovar");
    expect(contractPill({ status: "PENDING_RENEWAL", daysToExpire: 200 }).label).toBe("Por renovar");
  });

  it("marca vencido si ya pasó la fecha de fin o el estado es EXPIRED", () => {
    expect(contractPill({ status: "ACTIVE", daysToExpire: -1 }).label).toBe("Vencido");
    expect(contractPill({ status: "EXPIRED", daysToExpire: 30 }).label).toBe("Vencido");
  });
});

describe("mobile/input", () => {
  it("parsea montos capturados con formato", () => {
    expect(parseAmountInput("12,500.50")).toBe(12500.5);
    expect(parseAmountInput("$8000")).toBe(8000);
    expect(parseAmountInput("")).toBeNaN();
  });

  it("formatea la fecha local para <input type=date>", () => {
    expect(todayDateInput(new Date(2026, 9, 5))).toBe("2026-10-05");
  });
});

describe("mobile/nav", () => {
  it("agrega el origen a la URL", () => {
    expect(withOrigin("/lessees/abc", "inicio")).toBe("/lessees/abc?from=inicio");
    expect(withOrigin("/x?y=1", "plaza-p1")).toBe("/x?y=1&from=plaza-p1");
  });

  it("resuelve el botón de regreso", () => {
    const fallback = { href: "/lessees", label: "Inquilinos" };
    expect(backTarget(null, fallback)).toEqual(fallback);
    expect(backTarget("morosidad", fallback)).toEqual({
      href: "/collections?seg=morosidad",
      label: "Morosidad",
    });
    expect(backTarget("plaza-p1", fallback)).toEqual({ href: "/plazas/p1", label: "Propiedad" });
    expect(backTarget("desconocido", fallback)).toEqual(fallback);
  });

  it("mantiene activo el tab desde el que se abrió el detalle", () => {
    expect(activeTab("/", null)).toBe("inicio");
    expect(activeTab("/collections", null)).toBe("cobranza");
    expect(activeTab("/plazas/p1", null)).toBe("propiedades");
    expect(activeTab("/egresos", null)).toBe("mas");
    expect(activeTab("/lessees/abc", "morosidad")).toBe("cobranza");
    expect(activeTab("/lessees/abc", "plaza-p1")).toBe("propiedades");
  });
});

describe("validators/maintenance (captura móvil)", () => {
  it("acepta reportes sin fecha ni costo", () => {
    const parsed = createMaintenanceSchema.safeParse({
      propertyId: "p1",
      title: "Fuga en baño L3",
      type: "CORRECTIVE",
      responsibility: "OWNER",
    });
    expect(parsed.success).toBe(true);
  });

  it("acepta avanzar el estado sin completedDate ni costo", () => {
    expect(
      updateMaintenanceStatusSchema.safeParse({ maintenanceId: "m1", status: "IN_PROGRESS" }).success,
    ).toBe(true);
  });
});
