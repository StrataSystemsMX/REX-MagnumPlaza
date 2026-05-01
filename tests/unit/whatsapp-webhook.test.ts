import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const originalEnv = { ...process.env };

const notificationLogMock = {
  findFirst: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/prisma/client", () => ({
  prisma: {},
  prismaUnsafe: {
    notificationLog: notificationLogMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env["WHATSAPP_VERIFY_TOKEN"] = "test-verify-token";
  process.env["WHATSAPP_APP_SECRET"] = "test-app-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function signedRequest(body: string): Request {
  const sig = createHmac("sha256", "test-app-secret").update(body, "utf8").digest("hex");
  return new Request("https://example.com/api/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${sig}`,
    },
    body,
  });
}

describe("GET /api/webhooks/whatsapp (verificación)", () => {
  it("regresa el challenge cuando el token coincide", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const req = new Request(
      "https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("abc123");
  });

  it("403 cuando el token no coincide", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const req = new Request(
      "https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp (status events)", () => {
  it("rechaza payloads sin firma válida", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const req = new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"object":"whatsapp_business_account"}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("actualiza NotificationLog a DELIVERED cuando viene un status 'delivered'", async () => {
    notificationLogMock.findFirst.mockResolvedValue({
      id: "log-1",
      tenantId: "tenant-1",
      status: "SENT",
    });
    notificationLogMock.update.mockResolvedValue({});

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.HBgL...",
                    status: "delivered",
                    timestamp: "1714438800",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const res = await POST(signedRequest(JSON.stringify(payload)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json.ok).toBe(true);
    expect(json.updated).toBe(1);

    expect(notificationLogMock.findFirst).toHaveBeenCalledWith({
      where: { externalId: "wamid.HBgL..." },
      select: { id: true, tenantId: true, status: true },
    });
    expect(notificationLogMock.update).toHaveBeenCalledOnce();
    const updateArg = notificationLogMock.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; deliveredAt?: Date };
    };
    expect(updateArg.where.id).toBe("log-1");
    expect(updateArg.data.status).toBe("DELIVERED");
    expect(updateArg.data.deliveredAt).toBeInstanceOf(Date);
  });

  it("guarda failureReason cuando viene un status 'failed'", async () => {
    notificationLogMock.findFirst.mockResolvedValue({
      id: "log-2",
      tenantId: "tenant-1",
      status: "SENT",
    });
    notificationLogMock.update.mockResolvedValue({});

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.failed",
                    status: "failed",
                    timestamp: "1714438800",
                    errors: [{ code: 131026, message: "Recipient not on WhatsApp" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const res = await POST(signedRequest(JSON.stringify(payload)));
    expect(res.status).toBe(200);

    const updateArg = notificationLogMock.update.mock.calls[0]?.[0] as {
      data: { status: string; failureReason: string };
    };
    expect(updateArg.data.status).toBe("FAILED");
    expect(updateArg.data.failureReason).toContain("Recipient not on WhatsApp");
  });

  it("no regresa de READ a SENT (no advance)", async () => {
    notificationLogMock.findFirst.mockResolvedValue({
      id: "log-3",
      tenantId: "tenant-1",
      status: "READ",
    });

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.x", status: "sent", timestamp: "1714438800" },
                ],
              },
            },
          ],
        },
      ],
    };

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const res = await POST(signedRequest(JSON.stringify(payload)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { updated: number };
    expect(json.updated).toBe(0);
    expect(notificationLogMock.update).not.toHaveBeenCalled();
  });

  it("ignora externalIds desconocidos sin reventar", async () => {
    notificationLogMock.findFirst.mockResolvedValue(null);

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.unknown", status: "delivered", timestamp: "1714438800" },
                ],
              },
            },
          ],
        },
      ],
    };

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const res = await POST(signedRequest(JSON.stringify(payload)));
    expect(res.status).toBe(200);
    expect(notificationLogMock.update).not.toHaveBeenCalled();
  });
});
