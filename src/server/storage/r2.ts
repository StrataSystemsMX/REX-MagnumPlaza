import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface UploadResult {
  /** URL pública (bucket S3) o path relativo servible por Next (/generated-pdfs/...). */
  url: string;
  /** Storage backend que terminó atendiendo el upload. */
  backend: "s3" | "local";
}

/**
 * Almacenamiento S3-compatible: Supabase Storage en producción, Cloudflare R2
 * en desarrollo. Variables STORAGE_*; las R2_* se aceptan como respaldo para
 * los .env.local existentes (el endpoint se deriva de R2_ACCOUNT_ID).
 */
interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string | null;
}

export function getStorageConfig(): StorageConfig | null {
  const env = process.env;
  const r2AccountId = env["R2_ACCOUNT_ID"];
  const endpoint =
    env["STORAGE_ENDPOINT"] ||
    (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = env["STORAGE_ACCESS_KEY_ID"] || env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = env["STORAGE_SECRET_ACCESS_KEY"] || env["R2_SECRET_ACCESS_KEY"];
  const bucket = env["STORAGE_BUCKET"] || env["R2_BUCKET_NAME"];
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  const publicUrl = env["STORAGE_PUBLIC_URL"] || env["R2_PUBLIC_URL"];
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    region: env["STORAGE_REGION"] || "auto",
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl: publicUrl ? publicUrl.replace(/\/$/, "") : null,
  };
}

async function createS3Client(config: StorageConfig) {
  // Lazy import: el SDK pesa y solo lo necesitamos cuando hay storage configurado.
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Supabase Storage solo acepta path-style; R2 acepta ambos.
    forcePathStyle: true,
  });
}

/**
 * Sube un archivo y devuelve su URL.
 *
 *   - Con storage configurado (STORAGE_* o R2_*) → bucket S3-compatible.
 *   - Si no → guarda en `public/generated-pdfs/<key>` y devuelve un path
 *     servible por Next. Esto es OK en dev (filesystem escribible), pero
 *     en prod (Vercel) no — por eso el cron y la generación oficial deben
 *     correr siempre con storage configurado.
 *
 * `key` debe incluir extensión (ej. "estados-de-cuenta/2026-04-29-abc.pdf").
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const config = getStorageConfig();
  if (config) {
    const url = await uploadToBucket(config, key, buffer, mimeType);
    return { url, backend: "s3" };
  }
  const url = uploadToLocalPublic(key, buffer);
  return { url, backend: "local" };
}

async function uploadToBucket(
  config: StorageConfig,
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await createS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  if (config.publicUrl) return `${config.publicUrl}/${key}`;
  // Fallback: URL del endpoint privado (requiere firma para acceder).
  return `${config.endpoint}/${config.bucket}/${key}`;
}

function uploadToLocalPublic(key: string, buffer: Buffer): string {
  // Bajo /public para que Next lo sirva directo. La key puede traer
  // subcarpetas, las creamos.
  const root = join(process.cwd(), "public", "generated-pdfs");
  const fullPath = join(root, key);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, buffer);
  return `/generated-pdfs/${key}`;
}

/**
 * Borra un archivo previamente subido. Best-effort: si el bucket falla, lanza
 * para que el caller lo loggee y siga (no bloqueamos al usuario por una falla
 * de red — un huérfano es tolerable).
 */
export async function deleteFile(key: string): Promise<void> {
  const config = getStorageConfig();
  if (config) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await createS3Client(config);
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    return;
  }
  const fullPath = join(process.cwd(), "public", "generated-pdfs", key);
  if (existsSync(fullPath)) unlinkSync(fullPath);
}

/**
 * Deriva la `key` original a partir de la URL pública/privada/local.
 * Lanza si la URL no coincide con ningún formato conocido (ej. fue subida
 * con una configuración distinta).
 */
export function extractKeyFromUrl(url: string): string {
  const config = getStorageConfig();
  if (config?.publicUrl && url.startsWith(config.publicUrl + "/")) {
    return url.slice(config.publicUrl.length + 1);
  }
  const privateBase = config ? `${config.endpoint}/${config.bucket}/` : null;
  if (privateBase && url.startsWith(privateBase)) {
    return url.slice(privateBase.length);
  }
  // URLs privadas de R2 en formato virtual-host (subidas antes de path-style).
  const r2VirtualHost = url.match(
    /^https:\/\/[^.]+\.[^.]+\.r2\.cloudflarestorage\.com\/(.+)$/,
  );
  if (r2VirtualHost) return r2VirtualHost[1]!;
  if (url.startsWith("/generated-pdfs/")) {
    return url.slice("/generated-pdfs/".length);
  }
  throw new Error(`URL no reconocida para extracción de key: ${url}`);
}

/** Punto único de generación de keys para fotos de Property. */
export function r2KeyForPropertyPhoto(
  tenantId: string,
  propertyId: string,
  ext: string,
): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `tenants/${tenantId}/properties/${propertyId}/photos/${id}.${ext}`;
}

/** Punto único de generación de keys para fotos de Unit. */
export function r2KeyForUnitPhoto(
  tenantId: string,
  unitId: string,
  ext: string,
): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `tenants/${tenantId}/units/${unitId}/photos/${id}.${ext}`;
}

/** Punto único de generación de keys para documentos de Contract. */
export function r2KeyForContractDocument(
  tenantId: string,
  contractId: string,
  ext: string,
): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `tenants/${tenantId}/contracts/${contractId}/documents/${id}.${ext}`;
}

/** Punto único de generación de keys para adjuntos de Maintenance (fotos/vales/PDF). */
export function r2KeyForMaintenanceDocument(
  tenantId: string,
  maintenanceId: string,
  ext: string,
): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `tenants/${tenantId}/maintenances/${maintenanceId}/documents/${id}.${ext}`;
}

/** Punto único de generación de keys para comprobantes de Expense (foto/PDF). */
export function r2KeyForExpenseDocument(
  tenantId: string,
  expenseId: string,
  ext: string,
): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `tenants/${tenantId}/expenses/${expenseId}/documents/${id}.${ext}`;
}
