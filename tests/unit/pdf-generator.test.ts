// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// ============================================================================
// Mocks
// ============================================================================

const tenantMock = { findUniqueOrThrow: vi.fn() };
const lesseeMock = { findFirstOrThrow: vi.fn() };
const rentMock = { findFirstOrThrow: vi.fn(), findMany: vi.fn() };
const documentMock = { create: vi.fn() };
const notificationLogMock = { create: vi.fn() };

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    tenant: tenantMock,
    lessee: lesseeMock,
    rent: rentMock,
    document: documentMock,
    notificationLog: notificationLogMock,
  },
  prismaUnsafe: {},
}));

const uploadFileMock = vi.fn();
vi.mock("@/lib/storage/r2", () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

const TENANT_ID = "tenant-1";
const D = (n: number | string) => new Prisma.Decimal(n);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

const PDF_HEADER = "%PDF";
const ORIG_RANDOM = Math.random;

beforeAll(() => {
  // determinismo del randomSuffix
  Math.random = () => 0.123456;
});
afterAll(() => {
  Math.random = ORIG_RANDOM;
});

beforeEach(() => {
  vi.clearAllMocks();
  uploadFileMock.mockResolvedValue({
    url: "https://r2.example.com/test.pdf",
    backend: "r2",
  });
});

function fakeTenant() {
  return {
    id: TENANT_ID,
    name: "Plazas Magnum",
    brandLogoUrl: null,
    brandPrimaryColor: null,
  };
}

function fakeLesseeWithContracts() {
  return {
    id: "lessee-1",
    tenantId: TENANT_ID,
    legalName: "Sushi",
    contactName: "Juan Suzuki",
    rfc: null,
    contracts: [
      {
        id: "contract-1",
        monthlyAmount: D(10530.85),
        unit: {
          code: "L9",
          name: "Sushi",
          property: {
            name: "Plaza Magnum Progreso",
            managerEntity: {
              legalName: "CRT Desarrollo y Proyectos S.A. de C.V.",
              rfc: "CRT010101AAA",
              address: "Hermosillo, Sonora",
            },
          },
        },
        rents: [
          {
            period: utc(2026, 0, 1),
            amountDue: D(10530.85),
            amountPaid: D(10530.85),
            status: "PAID" as const,
          },
          {
            period: utc(2026, 1, 1),
            amountDue: D(10530.85),
            amountPaid: D(5000),
            status: "PARTIAL" as const,
          },
          {
            period: utc(2026, 2, 1),
            amountDue: D(10530.85),
            amountPaid: D(0),
            status: "OVERDUE_1M" as const,
          },
        ],
      },
    ],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("generateAccountStatement", () => {
  it("renderiza un PDF válido y crea Document en DB", async () => {
    tenantMock.findUniqueOrThrow.mockResolvedValue(fakeTenant());
    lesseeMock.findFirstOrThrow.mockResolvedValue(fakeLesseeWithContracts());
    documentMock.create.mockResolvedValue({ id: "doc-1" });

    const { generateAccountStatement } = await import("@/lib/pdf/generator");
    const result = await generateAccountStatement(TENANT_ID, "lessee-1");

    // Magic bytes del PDF
    expect(result.buffer.subarray(0, 4).toString()).toBe(PDF_HEADER);
    expect(result.buffer.byteLength).toBeGreaterThan(1000);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename).toMatch(/^estado-de-cuenta-sushi-\d{4}-\d{2}-\d{2}\.pdf$/);

    // Upload + Document
    expect(uploadFileMock).toHaveBeenCalledOnce();
    const [key, buf, mime] = uploadFileMock.mock.calls[0]!;
    expect(key).toContain(TENANT_ID);
    expect(key).toContain("account-statements/");
    expect(buf).toBe(result.buffer);
    expect(mime).toBe("application/pdf");

    expect(documentMock.create).toHaveBeenCalledOnce();
    const docArg = documentMock.create.mock.calls[0]?.[0] as {
      data: { tenantId: string; type: string; mimeType: string; filename: string };
    };
    expect(docArg.data.tenantId).toBe(TENANT_ID);
    expect(docArg.data.mimeType).toBe("application/pdf");
    expect(docArg.data.filename).toBe(result.filename);
    expect(result.documentId).toBe("doc-1");
    expect(result.url).toBe("https://r2.example.com/test.pdf");
  });

  it("persist:false omite upload + Document", async () => {
    tenantMock.findUniqueOrThrow.mockResolvedValue(fakeTenant());
    lesseeMock.findFirstOrThrow.mockResolvedValue(fakeLesseeWithContracts());

    const { generateAccountStatement } = await import("@/lib/pdf/generator");
    const result = await generateAccountStatement(TENANT_ID, "lessee-1", {
      persist: false,
    });

    expect(result.url).toBeNull();
    expect(result.documentId).toBeNull();
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(documentMock.create).not.toHaveBeenCalled();
    expect(result.buffer.subarray(0, 4).toString()).toBe(PDF_HEADER);
  });
});

// ============================================================================
// Aviso de mora
// ============================================================================

function fakeRentForReminder(
  status: "OVERDUE_1M" | "OVERDUE_2M" | "OVERDUE_3M" = "OVERDUE_2M",
) {
  return {
    id: "rent-x",
    tenantId: TENANT_ID,
    contractId: "contract-x",
    period: utc(2026, 1, 1),
    dueDate: utc(2026, 1, 1),
    amountDue: D(10000),
    amountPaid: D(0),
    status,
    contract: {
      id: "contract-x",
      paymentDay: 1,
      startDate: utc(2025, 11, 15),
      signedDate: utc(2025, 11, 15),
      lessee: {
        id: "lessee-x",
        legalName: "Hitness",
        contactName: null,
        rfc: null,
      },
      unit: {
        code: "L7",
        name: "Hitness",
        property: {
          name: "Plaza Magnum Quiroga 2",
          managerEntity: {
            legalName: "CRT Desarrollo y Proyectos S.A. de C.V.",
            rfc: "CRT010101AAA",
            address: "Hermosillo, Sonora",
          },
        },
      },
    },
  };
}

describe("generateOverdueReminder", () => {
  it("nivel 2M: renderiza PDF, crea Document tipo PAYMENT_REMINDER y NotificationLog PENDING", async () => {
    tenantMock.findUniqueOrThrow.mockResolvedValue(fakeTenant());
    rentMock.findFirstOrThrow.mockResolvedValue(fakeRentForReminder("OVERDUE_2M"));
    rentMock.findMany.mockResolvedValue([]);
    documentMock.create.mockResolvedValue({ id: "doc-2" });
    notificationLogMock.create.mockResolvedValue({ id: "log-1" });

    const { generateOverdueReminder } = await import("@/lib/pdf/generator");
    const result = await generateOverdueReminder(TENANT_ID, "rent-x", "2M");

    expect(result.buffer.subarray(0, 4).toString()).toBe(PDF_HEADER);
    expect(result.filename).toMatch(/^aviso-2m-hitness-\d{4}-\d{2}-\d{2}\.pdf$/);

    const docArg = documentMock.create.mock.calls[0]?.[0] as {
      data: { type: string; contractId: string };
    };
    expect(docArg.data.type).toBe("PAYMENT_REMINDER");
    expect(docArg.data.contractId).toBe("contract-x");

    const logArg = notificationLogMock.create.mock.calls[0]?.[0] as {
      data: {
        recipientType: string;
        recipientId: string;
        channel: string;
        templateCode: string;
        status: string;
      };
    };
    expect(logArg.data.recipientType).toBe("LESSEE");
    expect(logArg.data.recipientId).toBe("lessee-x");
    expect(logArg.data.channel).toBe("IN_PERSON");
    expect(logArg.data.templateCode).toBe("RENT_REMINDER_2M");
    expect(logArg.data.status).toBe("PENDING");
  });

  it("nivel 3M: tipo de Document es EVICTION_LETTER y templateCode EVICTION_INITIATION", async () => {
    tenantMock.findUniqueOrThrow.mockResolvedValue(fakeTenant());
    rentMock.findFirstOrThrow.mockResolvedValue(fakeRentForReminder("OVERDUE_3M"));
    rentMock.findMany.mockResolvedValue([]);
    documentMock.create.mockResolvedValue({ id: "doc-3" });
    notificationLogMock.create.mockResolvedValue({ id: "log-2" });

    const { generateOverdueReminder } = await import("@/lib/pdf/generator");
    const result = await generateOverdueReminder(TENANT_ID, "rent-x", "3M");

    expect(result.buffer.subarray(0, 4).toString()).toBe(PDF_HEADER);
    const docArg = documentMock.create.mock.calls[0]?.[0] as {
      data: { type: string };
    };
    expect(docArg.data.type).toBe("EVICTION_LETTER");
    const logArg = notificationLogMock.create.mock.calls[0]?.[0] as {
      data: { templateCode: string };
    };
    expect(logArg.data.templateCode).toBe("EVICTION_INITIATION");
  });
});

// ============================================================================
// resolveTokens
// ============================================================================

describe("resolveTokens", () => {
  it("reemplaza tokens conocidos y deja los desconocidos como placeholder", async () => {
    const { resolveTokens } = await import("@/lib/pdf/template-config");
    const result = resolveTokens("Hola {nombre}, debes {monto}, total {pendiente}", {
      nombre: "Juan",
      monto: "$1,000",
    });
    expect(result).toBe("Hola Juan, debes $1,000, total {pendiente}");
  });
});
