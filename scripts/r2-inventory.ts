/**
 * Inventaria todos los objetos del bucket R2 y los agrupa por
 * propertyId/unitId viejo (extraído de la key).
 *
 * Genera dos archivos en `scripts/`:
 *   - r2-inventory.json         — datos crudos: cuántas fotos por entidad,
 *                                 URLs de muestra, ext.
 *   - r2-mapping.template.json  — plantilla para que el usuario llene
 *                                 los nombres/códigos de las entidades
 *                                 actuales correspondientes.
 *
 * Uso: pnpm tsx --env-file=.env.local scripts/r2-inventory.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const accountId = process.env["R2_ACCOUNT_ID"];
const bucket = process.env["R2_BUCKET_NAME"];
const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
const publicUrlBase = process.env["R2_PUBLIC_URL"];

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("Faltan env vars de R2 (R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
  process.exit(1);
}

interface ParsedKey {
  type: "property" | "unit" | "contract" | "other";
  tenantId: string;
  entityId: string;
  ext: string;
}

function parseKey(key: string): ParsedKey | null {
  const prop = key.match(
    /^tenants\/([^/]+)\/properties\/([^/]+)\/photos\/[^.]+\.(.+)$/,
  );
  if (prop) return { type: "property", tenantId: prop[1]!, entityId: prop[2]!, ext: prop[3]! };

  const unit = key.match(
    /^tenants\/([^/]+)\/units\/([^/]+)\/photos\/[^.]+\.(.+)$/,
  );
  if (unit) return { type: "unit", tenantId: unit[1]!, entityId: unit[2]!, ext: unit[3]! };

  const contract = key.match(
    /^tenants\/([^/]+)\/contracts\/([^/]+)\/documents\/[^.]+\.(.+)$/,
  );
  if (contract) return { type: "contract", tenantId: contract[1]!, entityId: contract[2]!, ext: contract[3]! };

  return null;
}

function buildUrl(key: string): string {
  if (publicUrlBase) return `${publicUrlBase.replace(/\/$/, "")}/${key}`;
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
}

interface InventoryEntry {
  count: number;
  ext: Set<string>;
  tenantIds: Set<string>;
  sampleUrls: string[];
  sampleKeys: string[];
}

async function main(): Promise<void> {
  const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  });

  const properties = new Map<string, InventoryEntry>();
  const units = new Map<string, InventoryEntry>();
  const contracts = new Map<string, InventoryEntry>();
  const skipped: string[] = [];

  let continuationToken: string | undefined;
  let totalObjects = 0;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket!,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of result.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      totalObjects += 1;

      const parsed = parseKey(key);
      if (!parsed) {
        skipped.push(key);
        continue;
      }

      const target =
        parsed.type === "property"
          ? properties
          : parsed.type === "unit"
            ? units
            : parsed.type === "contract"
              ? contracts
              : null;
      if (!target) {
        skipped.push(key);
        continue;
      }

      const existing = target.get(parsed.entityId);
      const url = buildUrl(key);
      if (existing) {
        existing.count += 1;
        existing.ext.add(parsed.ext);
        existing.tenantIds.add(parsed.tenantId);
        if (existing.sampleUrls.length < 5) {
          existing.sampleUrls.push(url);
          existing.sampleKeys.push(key);
        }
      } else {
        target.set(parsed.entityId, {
          count: 1,
          ext: new Set([parsed.ext]),
          tenantIds: new Set([parsed.tenantId]),
          sampleUrls: [url],
          sampleKeys: [key],
        });
      }
    }

    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  const serializeMap = (m: Map<string, InventoryEntry>) =>
    Object.fromEntries(
      Array.from(m.entries()).map(([id, e]) => [
        id,
        {
          count: e.count,
          ext: Array.from(e.ext),
          tenantIds: Array.from(e.tenantIds),
          sampleUrls: e.sampleUrls,
          sampleKeys: e.sampleKeys,
        },
      ]),
    );

  const inventory = {
    summary: {
      totalObjects,
      properties: properties.size,
      units: units.size,
      contracts: contracts.size,
      skipped: skipped.length,
    },
    properties: serializeMap(properties),
    units: serializeMap(units),
    contracts: serializeMap(contracts),
    skippedKeys: skipped,
  };

  const inventoryPath = join("scripts", "r2-inventory.json");
  writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2), "utf-8");
  console.log(`Inventario escrito en ${inventoryPath}`);

  const template = {
    _instructions:
      "Llena cada entrada con el nombre/código actual. Para properties: 'name' = nombre exacto en la DB. Para units: 'property' = nombre de la plaza padre, 'code' = código del local (L1, LP, etc.). Si no quieres recuperar una entrada, déjala vacía o borra el bloque.",
    properties: Object.fromEntries(
      Array.from(properties.keys()).map((id) => [id, { name: "" }]),
    ),
    units: Object.fromEntries(
      Array.from(units.keys()).map((id) => [id, { property: "", code: "" }]),
    ),
  };

  const templatePath = join("scripts", "r2-mapping.template.json");
  writeFileSync(templatePath, JSON.stringify(template, null, 2), "utf-8");
  console.log(`Plantilla de mapeo escrita en ${templatePath}`);

  console.log("");
  console.log("=== RESUMEN ===");
  console.log(`Total objetos:     ${totalObjects}`);
  console.log(`Properties (viejas): ${properties.size}`);
  console.log(`Units (viejos):      ${units.size}`);
  console.log(`Contracts:           ${contracts.size}`);
  console.log(`No reconocidos:      ${skipped.length}`);
  console.log("");
  console.log("Siguiente paso:");
  console.log("  1. Copia r2-mapping.template.json → r2-mapping.json");
  console.log("  2. Abre cada sampleUrl en navegador (si R2 público)");
  console.log("  3. Llena name/property+code en r2-mapping.json");
  console.log("  4. Corre: pnpm tsx --env-file=.env.local scripts/r2-recover.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
