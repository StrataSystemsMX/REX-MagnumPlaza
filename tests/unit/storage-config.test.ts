import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_VARS = [
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_PUBLIC_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
];

const SUPABASE = {
  STORAGE_ENDPOINT: "https://ref123.storage.supabase.co/storage/v1/s3",
  STORAGE_REGION: "us-east-1",
  STORAGE_ACCESS_KEY_ID: "key",
  STORAGE_SECRET_ACCESS_KEY: "secret",
  STORAGE_BUCKET: "rex-prod",
  STORAGE_PUBLIC_URL: "https://ref123.supabase.co/storage/v1/object/public/rex-prod/",
};

function stubAll(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

beforeEach(() => {
  // Vacías = no configuradas, igual que en un .env con KEY=""
  for (const k of STORAGE_VARS) vi.stubEnv(k, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStorageConfig", () => {
  it("sin variables no hay storage (respaldo local)", async () => {
    const { getStorageConfig } = await import("@/server/storage/r2");
    expect(getStorageConfig()).toBeNull();
  });

  it("usa STORAGE_* (Supabase) y normaliza la URL pública", async () => {
    stubAll(SUPABASE);
    const { getStorageConfig } = await import("@/server/storage/r2");
    expect(getStorageConfig()).toEqual({
      endpoint: SUPABASE.STORAGE_ENDPOINT,
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "rex-prod",
      publicUrl: "https://ref123.supabase.co/storage/v1/object/public/rex-prod",
    });
  });

  it("acepta las R2_* viejas y deriva el endpoint de R2", async () => {
    stubAll({
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "k",
      R2_SECRET_ACCESS_KEY: "s",
      R2_BUCKET_NAME: "rex-uploads",
    });
    const { getStorageConfig } = await import("@/server/storage/r2");
    expect(getStorageConfig()).toMatchObject({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "rex-uploads",
      publicUrl: null,
    });
  });
});

describe("extractKeyFromUrl", () => {
  const KEY = "tenants/t1/units/u1/photos/abc.jpg";

  it("URL pública de Supabase", async () => {
    stubAll(SUPABASE);
    const { extractKeyFromUrl } = await import("@/server/storage/r2");
    expect(
      extractKeyFromUrl(`https://ref123.supabase.co/storage/v1/object/public/rex-prod/${KEY}`),
    ).toBe(KEY);
  });

  it("URL privada path-style del endpoint", async () => {
    stubAll({ ...SUPABASE, STORAGE_PUBLIC_URL: "" });
    const { extractKeyFromUrl } = await import("@/server/storage/r2");
    expect(extractKeyFromUrl(`${SUPABASE.STORAGE_ENDPOINT}/rex-prod/${KEY}`)).toBe(KEY);
  });

  it("URL privada vieja de R2 (virtual-host) y path local", async () => {
    const { extractKeyFromUrl } = await import("@/server/storage/r2");
    expect(extractKeyFromUrl(`https://bucket.acct.r2.cloudflarestorage.com/${KEY}`)).toBe(KEY);
    expect(extractKeyFromUrl(`/generated-pdfs/${KEY}`)).toBe(KEY);
  });

  it("lanza con una URL desconocida", async () => {
    const { extractKeyFromUrl } = await import("@/server/storage/r2");
    expect(() => extractKeyFromUrl("https://example.com/x.jpg")).toThrow();
  });
});
