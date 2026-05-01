import { describe, expect, it } from "vitest";
import { createLesseeSchema } from "@/lib/validators/lessee";

describe("createLesseeSchema", () => {
  it("acepta una entrada mínima válida", () => {
    const r = createLesseeSchema.safeParse({
      legalName: "Acme S.A. de C.V.",
      preferredChannel: "WHATSAPP",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un RFC mal formado", () => {
    const r = createLesseeSchema.safeParse({
      legalName: "Acme",
      rfc: "no-es-rfc",
      preferredChannel: "WHATSAPP",
    });
    expect(r.success).toBe(false);
  });

  it("acepta RFC moral válido (12 caracteres)", () => {
    const r = createLesseeSchema.safeParse({
      legalName: "Acme",
      rfc: "ACM010101AAA",
      preferredChannel: "EMAIL",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rfc).toBe("ACM010101AAA"); // upper-cased
    }
  });

  it("rechaza un teléfono que no es +52 + 10 dígitos", () => {
    const r = createLesseeSchema.safeParse({
      legalName: "Acme",
      phone: "5551234567", // sin +52
      preferredChannel: "PHONE_CALL",
    });
    expect(r.success).toBe(false);
  });

  it("acepta un teléfono mexicano correcto", () => {
    const r = createLesseeSchema.safeParse({
      legalName: "Acme",
      phone: "+526621234567",
      whatsapp: "+526621234567",
      preferredChannel: "WHATSAPP",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza si falta el canal preferido", () => {
    const r = createLesseeSchema.safeParse({ legalName: "Acme" });
    expect(r.success).toBe(false);
  });
});
