import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_TOKEN = "WHATSAPP_ACCESS_TOKEN";
const ENV_PHONE_ID = "WHATSAPP_PHONE_NUMBER_ID";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env[ENV_TOKEN];
  delete process.env[ENV_PHONE_ID];
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("normalizePhone", () => {
  it("agrega prefijo de México a 10 dígitos", async () => {
    const { normalizePhone } = await import("@/lib/whatsapp/client");
    expect(normalizePhone("662 123 4567")).toBe("526621234567");
  });

  it("respeta números ya con código de país", async () => {
    const { normalizePhone } = await import("@/lib/whatsapp/client");
    expect(normalizePhone("+52 662 1234567")).toBe("526621234567");
  });

  it("rechaza números muy cortos", async () => {
    const { normalizePhone, WhatsAppError } = await import("@/lib/whatsapp/client");
    expect(() => normalizePhone("123")).toThrow(WhatsAppError);
  });
});

describe("sendTemplate (dev mode, sin token)", () => {
  it("simula el envío y devuelve un messageId fake", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendTemplate } = await import("@/lib/whatsapp/client");
    const result = await sendTemplate("6621234567", "rent_reminder_1m", [
      "Goyoma",
      "abril 2026",
      "$10,000",
      "https://example.com/pdf",
    ]);
    expect(result.status).toBe("SIMULATED");
    expect(result.messageId).toMatch(/^fake-/);
    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = consoleSpy.mock.calls[0]?.[0];
    expect(logged).toContain("rent_reminder_1m");
    expect(logged).toContain("Goyoma");
  });
});

describe("sendTemplate (prod mode, con token)", () => {
  beforeEach(() => {
    process.env[ENV_TOKEN] = "test-token";
    process.env[ENV_PHONE_ID] = "test-phone-id";
  });

  it("manda POST a Graph API con la plantilla y devuelve messageId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.HBgL..." }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sendTemplate } = await import("@/lib/whatsapp/client");
    const result = await sendTemplate("6621234567", "rent_reminder_1m", [
      "Goyoma",
      "abril 2026",
      "$10,000",
      "url",
    ]);

    expect(result.status).toBe("SENT");
    expect(result.messageId).toBe("wamid.HBgL...");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/test-phone-id/messages");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.template.name).toBe("rent_reminder_1m");
    expect(body.template.language.code).toBe("es_MX");
    expect(body.template.components[0].parameters).toHaveLength(4);
    expect(body.template.components[0].parameters[0]).toEqual({
      type: "text",
      text: "Goyoma",
    });
  });

  it("mapea error 132000 a TEMPLATE_NOT_APPROVED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 132000, message: "Template name does not exist" },
        }),
      }),
    );
    const { sendTemplate, WhatsAppError } = await import("@/lib/whatsapp/client");
    await expect(sendTemplate("6621234567", "missing", [])).rejects.toMatchObject({
      name: "WhatsAppError",
      code: "TEMPLATE_NOT_APPROVED",
    });
    // Verificación cruzada de tipo.
    await expect(sendTemplate("6621234567", "missing", [])).rejects.toBeInstanceOf(
      WhatsAppError,
    );
  });

  it("mapea error 130429 a RATE_LIMITED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: { code: 130429, message: "Too many messages" },
        }),
      }),
    );
    const { sendTemplate } = await import("@/lib/whatsapp/client");
    await expect(sendTemplate("6621234567", "rent_reminder_1m", [])).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("mapea error 131026 a NOT_ON_WHATSAPP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 131026, message: "Recipient not on WhatsApp" },
        }),
      }),
    );
    const { sendTemplate } = await import("@/lib/whatsapp/client");
    await expect(sendTemplate("6621234567", "x", [])).rejects.toMatchObject({
      code: "NOT_ON_WHATSAPP",
    });
  });

  it("mapea error 131047 a OUTSIDE_SERVICE_WINDOW en sendTextMessage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 131047, message: "Outside 24h window" },
        }),
      }),
    );
    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    await expect(sendTextMessage("6621234567", "hola")).rejects.toMatchObject({
      code: "OUTSIDE_SERVICE_WINDOW",
    });
  });
});

describe("isWhatsAppConfigured", () => {
  it("false sin variables de entorno", async () => {
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp/client");
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it("true con ambas variables", async () => {
    process.env[ENV_TOKEN] = "x";
    process.env[ENV_PHONE_ID] = "y";
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp/client");
    expect(isWhatsAppConfigured()).toBe(true);
  });
});
