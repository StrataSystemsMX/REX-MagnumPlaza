import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks (deben definirse antes de los imports que se mockean)
// ============================================================================

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockRevalidatePath = vi.fn();
const mockUploadFile = vi.fn();
const mockDeleteFile = vi.fn();

const propertyMock = {
  findFirstOrThrow: vi.fn(),
};
const documentMock = {
  create: vi.fn(),
  findFirstOrThrow: vi.fn(),
  deleteMany: vi.fn(),
};
const auditLogMock = { create: vi.fn() };

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/auth/get-session", () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return {
    ...actual,
    requirePermission: (...args: [string, string]) => mockRequirePermission(...args),
  };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    property: propertyMock,
    document: documentMock,
    auditLog: auditLogMock,
  },
  prismaUnsafe: {},
}));

vi.mock("@/lib/storage/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/r2")>(
    "@/lib/storage/r2",
  );
  return {
    ...actual,
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  };
});

// ============================================================================
// Helpers
// ============================================================================

function makeFile(opts: { name?: string; type?: string; bytes?: number } = {}): File {
  const size = opts.bytes ?? 1024;
  const blob = new Blob([new Uint8Array(size)], { type: opts.type ?? "image/jpeg" });
  return new File([blob], opts.name ?? "foto.jpg", { type: opts.type ?? "image/jpeg" });
}

function makeFormData(propertyId: string, file: File | null): FormData {
  const fd = new FormData();
  fd.set("propertyId", propertyId);
  if (file) fd.set("file", file);
  return fd;
}

// ============================================================================
// Validador
// ============================================================================

describe("uploadPropertyPhotoSchema", () => {
  it("rechaza MIME no permitido", async () => {
    const { uploadPropertyPhotoSchema } = await import("@/lib/validators/document");
    const result = uploadPropertyPhotoSchema.safeParse({
      propertyId: "p-1",
      file: makeFile({ type: "application/pdf", name: "doc.pdf" }),
    });
    expect(result.success).toBe(false);
  });

  it("rechaza archivos > 5 MB", async () => {
    const { uploadPropertyPhotoSchema, MAX_PROPERTY_PHOTO_SIZE_BYTES } = await import(
      "@/lib/validators/document"
    );
    const result = uploadPropertyPhotoSchema.safeParse({
      propertyId: "p-1",
      file: makeFile({ bytes: MAX_PROPERTY_PHOTO_SIZE_BYTES + 1 }),
    });
    expect(result.success).toBe(false);
  });

  it("acepta JPG válido", async () => {
    const { uploadPropertyPhotoSchema } = await import("@/lib/validators/document");
    const result = uploadPropertyPhotoSchema.safeParse({
      propertyId: "p-1",
      file: makeFile(),
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// actionUploadPropertyPhoto
// ============================================================================

describe("actionUploadPropertyPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: "clerk_123",
      tenantId: "tenant-1",
      user: {},
      dbUser: { id: "db-user-1", tenantId: "tenant-1" },
    });
    mockRequirePermission.mockResolvedValue(undefined);
    mockUploadFile.mockResolvedValue({ url: "/generated-pdfs/key.jpg", backend: "local" });
    propertyMock.findFirstOrThrow.mockResolvedValue({ id: "prop-1" });
    documentMock.create.mockResolvedValue({ id: "doc-1", url: "/generated-pdfs/key.jpg" });
  });

  it("falla con PermissionError si no tiene property.update", async () => {
    mockRequirePermission.mockImplementation(async (_userId, code: string) => {
      const { PermissionError } = await import("@/lib/auth/permissions");
      throw new PermissionError(code);
    });
    const { actionUploadPropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    await expect(
      actionUploadPropertyPhoto(makeFormData("prop-1", makeFile())),
    ).rejects.toMatchObject({ name: "PermissionError", code: "property.update" });
    expect(documentMock.create).not.toHaveBeenCalled();
  });

  it("rechaza propertyId de otro tenant (findFirstOrThrow lanza)", async () => {
    propertyMock.findFirstOrThrow.mockRejectedValue(new Error("NotFound"));
    const { actionUploadPropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    await expect(
      actionUploadPropertyPhoto(makeFormData("prop-otra-tenant", makeFile())),
    ).rejects.toThrow();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(documentMock.create).not.toHaveBeenCalled();
  });

  it("rechaza MIME inválido antes de tocar storage o DB", async () => {
    const { actionUploadPropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    await expect(
      actionUploadPropertyPhoto(
        makeFormData("prop-1", makeFile({ type: "application/pdf", name: "x.pdf" })),
      ),
    ).rejects.toThrow();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(documentMock.create).not.toHaveBeenCalled();
  });

  it("happy path: crea Document con tenantId y type=PROPERTY_PHOTO", async () => {
    const { actionUploadPropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    const result = await actionUploadPropertyPhoto(
      makeFormData("prop-1", makeFile({ name: "frente.jpg" })),
    );

    expect(result).toEqual({ id: "doc-1", url: "/generated-pdfs/key.jpg" });

    expect(propertyMock.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "prop-1", tenantId: "tenant-1" },
      select: { id: true },
    });

    const uploadCall = mockUploadFile.mock.calls[0] as [string, Buffer, string];
    expect(uploadCall[0]).toMatch(/^tenants\/tenant-1\/properties\/prop-1\/photos\/[a-f0-9]+\.jpg$/);
    expect(uploadCall[2]).toBe("image/jpeg");

    const createArg = documentMock.create.mock.calls[0]?.[0] as {
      data: { tenantId: string; type: string; propertyId: string; filename: string };
    };
    expect(createArg.data).toMatchObject({
      tenantId: "tenant-1",
      type: "PROPERTY_PHOTO",
      propertyId: "prop-1",
      filename: "frente.jpg",
      uploadedById: "db-user-1",
    });

    expect(auditLogMock.create).toHaveBeenCalledOnce();
    const auditArg = auditLogMock.create.mock.calls[0]?.[0] as {
      data: { entityType: string; entityId: string; action: string };
    };
    expect(auditArg.data).toMatchObject({
      entityType: "Document",
      entityId: "doc-1",
      action: "CREATE",
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith("/properties");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/properties/prop-1");
  });
});

// ============================================================================
// actionDeletePropertyPhoto
// ============================================================================

describe("actionDeletePropertyPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: "clerk_123",
      tenantId: "tenant-1",
      user: {},
      dbUser: { id: "db-user-1", tenantId: "tenant-1" },
    });
    mockRequirePermission.mockResolvedValue(undefined);
  });

  it("rechaza documentId de otro tenant (findFirstOrThrow lanza)", async () => {
    documentMock.findFirstOrThrow.mockRejectedValue(new Error("NotFound"));
    const { actionDeletePropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    await expect(
      actionDeletePropertyPhoto({ documentId: "doc-x" }),
    ).rejects.toThrow();
    expect(documentMock.deleteMany).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("borra Document, intenta borrar en R2, escribe AuditLog", async () => {
    documentMock.findFirstOrThrow.mockResolvedValue({
      id: "doc-1",
      url: "/generated-pdfs/tenants/tenant-1/properties/prop-1/photos/abc.jpg",
      propertyId: "prop-1",
    });
    documentMock.deleteMany.mockResolvedValue({ count: 1 });
    mockDeleteFile.mockResolvedValue(undefined);

    const { actionDeletePropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    await actionDeletePropertyPhoto({ documentId: "doc-1" });

    expect(documentMock.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "doc-1", tenantId: "tenant-1", type: "PROPERTY_PHOTO" },
      select: { id: true, url: true, propertyId: true },
    });
    expect(documentMock.deleteMany).toHaveBeenCalledWith({
      where: { id: "doc-1", tenantId: "tenant-1" },
    });
    expect(mockDeleteFile).toHaveBeenCalledWith(
      "tenants/tenant-1/properties/prop-1/photos/abc.jpg",
    );
    expect(auditLogMock.create).toHaveBeenCalledOnce();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/properties/prop-1");
  });

  it("si R2 falla al borrar, no propaga el error (huérfano tolerable)", async () => {
    documentMock.findFirstOrThrow.mockResolvedValue({
      id: "doc-1",
      url: "/generated-pdfs/tenants/tenant-1/properties/prop-1/photos/abc.jpg",
      propertyId: "prop-1",
    });
    documentMock.deleteMany.mockResolvedValue({ count: 1 });
    mockDeleteFile.mockRejectedValue(new Error("R2 unreachable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { actionDeletePropertyPhoto } = await import(
      "@/lib/services/property-photos"
    );
    await expect(
      actionDeletePropertyPhoto({ documentId: "doc-1" }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
