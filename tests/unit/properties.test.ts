import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks (deben definirse antes de los imports que se mockean)
// ============================================================================

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockHasPermission = vi.fn();
const mockRevalidatePath = vi.fn();

const propertyMock = {
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
};
const auditLogMock = { create: vi.fn() };
const userRoleMock = { findFirst: vi.fn() };

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/auth/get-session", () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock("@/lib/auth/active-legal-entity", () => ({
  getActiveLegalEntityId: vi.fn().mockResolvedValue(null),
  legalEntityPropertyFilter: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return {
    ...actual,
    requirePermission: (...args: [string, string]) => mockRequirePermission(...args),
    hasPermission: (...args: [string, string]) => mockHasPermission(...args),
  };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    property: propertyMock,
    auditLog: auditLogMock,
    userRole: userRoleMock,
  },
  prismaUnsafe: {},
}));

// ============================================================================
// Tests
// ============================================================================

describe("createPropertySchema", () => {
  it("rechaza datos inválidos: nombre vacío y tipo inválido", async () => {
    const { createPropertySchema } = await import("@/lib/validators/property");

    const result = createPropertySchema.safeParse({
      name: "",
      type: "INVALIDO",
      address: "",
      ownerEntityId: "",
      managerEntityId: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("El nombre es requerido.");
      expect(messages).toContain("La dirección es requerida.");
      expect(messages).toContain("Selecciona la razón social dueña.");
      expect(messages).toContain("Selecciona la razón social administradora.");
    }
  });

  it("acepta una entrada mínima válida", async () => {
    const { createPropertySchema } = await import("@/lib/validators/property");
    const result = createPropertySchema.safeParse({
      name: "Plaza Demo",
      type: "PLAZA_COMERCIAL",
      address: "Calle Falsa 123",
      ownerEntityId: "le-1",
      managerEntityId: "le-1",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza latitudes fuera de rango", async () => {
    const { createPropertySchema } = await import("@/lib/validators/property");
    const result = createPropertySchema.safeParse({
      name: "Plaza Demo",
      type: "PLAZA_COMERCIAL",
      address: "Calle Falsa 123",
      ownerEntityId: "le-1",
      managerEntityId: "le-1",
      latitude: 999,
    });
    expect(result.success).toBe(false);
  });
});

describe("actionCreateProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: "clerk_123",
      tenantId: "tenant-1",
      user: {},
      dbUser: { id: "db-user-1", tenantId: "tenant-1" },
    });
  });

  it("falla con PermissionError si el usuario no tiene property.create", async () => {
    mockRequirePermission.mockImplementation(async (_userId, code: string) => {
      const { PermissionError } = await import("@/lib/auth/permissions");
      throw new PermissionError(code);
    });

    const { actionCreateProperty } = await import("@/lib/services/properties");

    await expect(
      actionCreateProperty({
        name: "Plaza Demo",
        type: "PLAZA_COMERCIAL",
        address: "Calle Falsa 123",
        ownerEntityId: "le-1",
        managerEntityId: "le-1",
      }),
    ).rejects.toMatchObject({
      name: "PermissionError",
      code: "property.create",
    });

    expect(propertyMock.create).not.toHaveBeenCalled();
    expect(auditLogMock.create).not.toHaveBeenCalled();
  });

  it("crea la property con tenantId del contexto y escribe AuditLog", async () => {
    mockRequirePermission.mockResolvedValue(undefined);
    propertyMock.create.mockResolvedValue({ id: "prop-1", name: "Plaza Demo" });

    const { actionCreateProperty } = await import("@/lib/services/properties");

    const result = await actionCreateProperty({
      name: "Plaza Demo",
      type: "PLAZA_COMERCIAL",
      address: "Calle Falsa 123",
      ownerEntityId: "le-1",
      managerEntityId: "le-1",
    });

    expect(result).toEqual({ id: "prop-1", name: "Plaza Demo" });
    expect(propertyMock.create).toHaveBeenCalledOnce();
    const createArg = propertyMock.create.mock.calls[0]?.[0] as {
      data: { tenantId: string; name: string };
    };
    expect(createArg.data.tenantId).toBe("tenant-1");
    expect(createArg.data.name).toBe("Plaza Demo");

    expect(auditLogMock.create).toHaveBeenCalledOnce();
    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { tenantId: string; entityType: string; entityId: string; action: string };
    };
    expect(auditArg.data).toMatchObject({
      tenantId: "tenant-1",
      entityType: "Property",
      entityId: "prop-1",
      action: "CREATE",
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith("/plazas");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/inmuebles");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/units");
  });
});

describe("getProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: "clerk_123",
      tenantId: "tenant-42",
      user: {},
      dbUser: { id: "db-user-1", tenantId: "tenant-42" },
    });
    propertyMock.findMany.mockResolvedValue([]);
  });

  it("filtra siempre por tenantId del contexto y por defecto solo activos", async () => {
    const { getProperties } = await import("@/lib/services/properties-queries");
    await getProperties();

    expect(propertyMock.findMany).toHaveBeenCalledOnce();
    const arg = propertyMock.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; isActive?: boolean };
    };
    expect(arg.where.tenantId).toBe("tenant-42");
    expect(arg.where.isActive).toBe(true);
  });

  it("aplica filtro por tipo cuando se pide", async () => {
    const { getProperties } = await import("@/lib/services/properties-queries");
    await getProperties({ type: "OFICINA" });

    const arg = propertyMock.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; type?: string };
    };
    expect(arg.where.type).toBe("OFICINA");
    expect(arg.where.tenantId).toBe("tenant-42");
  });

  it("status=all omite el filtro isActive (incluye inactivos)", async () => {
    const { getProperties } = await import("@/lib/services/properties-queries");
    await getProperties({ status: "all" });

    const arg = propertyMock.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; isActive?: boolean };
    };
    expect(arg.where.isActive).toBeUndefined();
    expect(arg.where.tenantId).toBe("tenant-42");
  });
});
