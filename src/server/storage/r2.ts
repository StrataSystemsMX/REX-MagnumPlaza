import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface UploadResult {
  /** URL pública (R2) o path relativo servible por Next (/generated-pdfs/...). */
  url: string;
  /** Storage backend que terminó atendiendo el upload. */
  backend: "r2" | "local";
}

function isR2Configured(): boolean {
  return Boolean(
    process.env["R2_ACCOUNT_ID"] &&
      process.env["R2_ACCESS_KEY_ID"] &&
      process.env["R2_SECRET_ACCESS_KEY"] &&
      process.env["R2_BUCKET_NAME"],
  );
}

/**
 * Sube un archivo y devuelve su URL.
 *
 *   - Si las variables R2_* están configuradas → Cloudflare R2 (S3-compatible).
 *   - Si no → guarda en `public/generated-pdfs/<key>` y devuelve un path
 *     servible por Next. Esto es OK en dev (filesystem escribible), pero
 *     en prod (Vercel) no — por eso el cron y la generación oficial deben
 *     correr siempre con R2 configurado.
 *
 * `key` debe incluir extensión (ej. "estados-de-cuenta/2026-04-29-abc.pdf").
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  if (isR2Configured()) {
    const url = await uploadToR2(key, buffer, mimeType);
    return { url, backend: "r2" };
  }
  const url = uploadToLocalPublic(key, buffer);
  return { url, backend: "local" };
}

async function uploadToR2(
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const accountId = process.env["R2_ACCOUNT_ID"]!;
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"]!;
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"]!;
  const bucket = process.env["R2_BUCKET_NAME"]!;
  const publicUrlBase = process.env["R2_PUBLIC_URL"];

  // Lazy import: el SDK pesa y solo lo necesitamos cuando R2 está configurado.
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  if (publicUrlBase) {
    return `${publicUrlBase.replace(/\/$/, "")}/${key}`;
  }
  // Fallback: URL del endpoint privado (requiere firma para acceder).
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
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
 * Borra un archivo previamente subido. Best-effort: si R2 falla, lanza para
 * que el caller lo loggee y siga (no bloqueamos al usuario por una falla
 * de red en R2 — un huérfano es tolerable).
 */
export async function deleteFile(key: string): Promise<void> {
  if (isR2Configured()) {
    const accountId = process.env["R2_ACCOUNT_ID"]!;
    const accessKeyId = process.env["R2_ACCESS_KEY_ID"]!;
    const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"]!;
    const bucket = process.env["R2_BUCKET_NAME"]!;

    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
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
  const publicBase = process.env["R2_PUBLIC_URL"]?.replace(/\/$/, "");
  if (publicBase && url.startsWith(publicBase + "/")) {
    return url.slice(publicBase.length + 1);
  }
  const privateMatch = url.match(
    /^https:\/\/[^.]+\.[^.]+\.r2\.cloudflarestorage\.com\/(.+)$/,
  );
  if (privateMatch) return privateMatch[1]!;
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
