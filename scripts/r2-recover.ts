/**
 * Recupera Document records en la DB para las fotos/PDFs que existen en R2
 * pero perdieron su registro tras un `prisma migrate reset`.
 *
 * Lee `scripts/r2-inventory.json` (generado por r2-inventory.ts) y
 * `scripts/r2-mapping.json` (lleno por el usuario), busca cada entidad
 * actual por nombre/código y crea los Document apuntando a las URLs
 * existentes en R2.
 *
 * Uso:
 *   pnpm tsx --env-file=.env.local scripts/r2-recover.ts            # dry-run
 *   pnpm tsx --env-file=.env.local scripts/r2-recover.ts --apply    # ejecuta
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const apply = process.argv.includes("--apply");

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido en .env.local");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

interface InventoryEntry {
  count: number;
  ext: string[];
  tenantIds: string[];
  sampleUrls: string[];
  sampleKeys: string[];
}

interface Inventory {
  properties: Record<string, InventoryEntry>;
  units: Record<string, InventoryEntry>;
  contracts: Record<string, InventoryEntry>;
}

interface Mapping {
  properties?: Record<string, { name: string }>;
  units?: Record<string, { property: string; code: string }>;
  // contracts: por ahora ignorados — solo había 1 PDF de prueba.
}

function buildKeyFromUrl(url: string): string {
  const publicBase = process.env["R2_PUBLIC_URL"]?.replace(/\/$/, "");
  if (publicBase && url.startsWith(publicBase + "/")) {
    return url.slice(publicBase.length + 1);
  }
  const m = url.match(/^https:\/\/[^/]+\/(.+)$/);
  if (!m) throw new Error(`URL no parseable: ${url}`);
  return m[1]!;
}

async function main(): Promise<void> {
  const inventoryPath = join("scripts", "r2-inventory.json");
  const mappingPath = join("scripts", "r2-mapping.json");

  const inventory: Inventory = JSON.parse(readFileSync(inventoryPath, "utf-8"));
  const mapping: Mapping = JSON.parse(readFileSync(mappingPath, "utf-8"));

  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (sin escribir)"}`);
  console.log("");

  let createdProperty = 0;
  let createdUnit = 0;
  let skippedExisting = 0;
  let skippedUnmapped = 0;
  let errors = 0;

  // ---------- PROPERTIES ----------
  for (const [oldId, entry] of Object.entries(inventory.properties)) {
    const map = mapping.properties?.[oldId];
    if (!map || !map.name?.trim()) {
      console.log(`[property ${oldId}] sin mapeo → skip (${entry.count} foto${entry.count === 1 ? "" : "s"})`);
      skippedUnmapped += entry.count;
      continue;
    }

    const property = await prisma.property.findFirst({
      where: { name: map.name, isActive: true },
      select: { id: true, tenantId: true, name: true },
    });

    if (!property) {
      console.error(`[property ${oldId}] no se encontró Property con name="${map.name}"`);
      errors += entry.count;
      continue;
    }

    // Listar TODAS las keys de R2 para este oldId (no solo samples).
    // Como el inventario solo guardó samples, necesitamos re-listar para obtener todas.
    // Truco: re-listar prefijo específico.
    const allKeys = await listAllKeysForPrefix(
      `tenants/${entry.tenantIds[0]}/properties/${oldId}/photos/`,
    );

    for (const key of allKeys) {
      const url = buildUrl(key);
      const existing = await prisma.document.findFirst({ where: { url } });
      if (existing) {
        skippedExisting += 1;
        continue;
      }

      const ext = key.split(".").pop() ?? "bin";
      const filename = key.split("/").pop() ?? key;
      console.log(
        `[property ${property.name}] ${apply ? "creando" : "(dry) crearía"} Document → ${key}`,
      );

      if (apply) {
        await prisma.document.create({
          data: {
            tenantId: property.tenantId,
            type: "PROPERTY_PHOTO",
            propertyId: property.id,
            url,
            filename,
            mimeType: ext === "pdf" ? "application/pdf" : `image/${ext}`,
          },
        });
      }
      createdProperty += 1;
    }
  }

  // ---------- UNITS ----------
  for (const [oldId, entry] of Object.entries(inventory.units)) {
    const map = mapping.units?.[oldId];
    if (!map || !map.property?.trim() || !map.code?.trim()) {
      console.log(`[unit ${oldId}] sin mapeo → skip`);
      skippedUnmapped += entry.count;
      continue;
    }

    const unit = await prisma.unit.findFirst({
      where: {
        code: map.code,
        isActive: true,
        property: { name: map.property, isActive: true },
      },
      select: { id: true, tenantId: true, code: true, propertyId: true },
    });

    if (!unit) {
      console.error(
        `[unit ${oldId}] no se encontró Unit code="${map.code}" en property="${map.property}"`,
      );
      errors += entry.count;
      continue;
    }

    const allKeys = await listAllKeysForPrefix(
      `tenants/${entry.tenantIds[0]}/units/${oldId}/photos/`,
    );

    for (const key of allKeys) {
      const url = buildUrl(key);
      const existing = await prisma.document.findFirst({ where: { url } });
      if (existing) {
        skippedExisting += 1;
        continue;
      }

      const ext = key.split(".").pop() ?? "bin";
      const filename = key.split("/").pop() ?? key;
      console.log(
        `[unit ${map.property} / ${unit.code}] ${apply ? "creando" : "(dry) crearía"} Document → ${key}`,
      );

      if (apply) {
        await prisma.document.create({
          data: {
            tenantId: unit.tenantId,
            type: "UNIT_PHOTO",
            unitId: unit.id,
            url,
            filename,
            mimeType: ext === "pdf" ? "application/pdf" : `image/${ext}`,
          },
        });
      }
      createdUnit += 1;
    }
  }

  console.log("");
  console.log("=== RESUMEN ===");
  console.log(`Documents creados (property):  ${createdProperty}`);
  console.log(`Documents creados (unit):      ${createdUnit}`);
  console.log(`Ya existían (skipped):         ${skippedExisting}`);
  console.log(`Sin mapeo (skipped):           ${skippedUnmapped}`);
  console.log(`Errores (entidad no hallada):  ${errors}`);
  if (!apply) {
    console.log("");
    console.log("Esto fue un DRY-RUN. Si todo se ve bien, corre con --apply para escribir a la DB.");
  }
}

async function listAllKeysForPrefix(prefix: string): Promise<string[]> {
  const accountId = process.env["R2_ACCOUNT_ID"]!;
  const bucket = process.env["R2_BUCKET_NAME"]!;
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"]!;
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"]!;

  const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? []) {
      if (o.Key) out.push(o.Key);
    }
    token = r.NextContinuationToken;
  } while (token);
  return out;
}

function buildUrl(key: string): string {
  const publicBase = process.env["R2_PUBLIC_URL"]?.replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key}`;
  const accountId = process.env["R2_ACCOUNT_ID"]!;
  const bucket = process.env["R2_BUCKET_NAME"]!;
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
}

// Suprime warning unused — buildKeyFromUrl es helper público potencial.
void buildKeyFromUrl;

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
