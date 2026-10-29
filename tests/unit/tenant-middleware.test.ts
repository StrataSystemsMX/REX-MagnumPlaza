import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_SCOPED_MODELS } from "@/server/prisma/tenant-middleware";

/**
 * El guardrail multi-tenant depende de un set hardcodeado de modelos (el
 * generador `prisma-client` no expone Prisma.dmmf en runtime). Este test lo
 * mantiene sincronizado con el schema: si se agrega un modelo con tenantId y
 * no se registra en TENANT_SCOPED_MODELS, falla aquí en vez de fugar datos.
 */

function modelsWithTenantIdFromSchema(): Set<string> {
  const schema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const result = new Set<string>();
  const modelRegex = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const match of schema.matchAll(modelRegex)) {
    const [, name, body] = match;
    // Campo escalar tenantId (no atrapa comentarios ni relaciones `tenant`).
    if (/^\s+tenantId\s+String/m.test(body!)) {
      result.add(name!);
    }
  }
  return result;
}

describe("TENANT_SCOPED_MODELS", () => {
  it("cubre exactamente los modelos del schema que tienen tenantId", () => {
    const fromSchema = modelsWithTenantIdFromSchema();
    // Sanity: el parser encontró los modelos núcleo.
    expect(fromSchema).toContain("Rent");
    expect(fromSchema).toContain("Payment");

    const missing = [...fromSchema].filter((m) => !TENANT_SCOPED_MODELS.has(m));
    const extra = [...TENANT_SCOPED_MODELS].filter((m) => !fromSchema.has(m));

    expect(missing, `Modelos con tenantId SIN guardrail: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `Modelos en el guardrail que ya no tienen tenantId: ${extra.join(", ")}`).toEqual([]);
  });
});
