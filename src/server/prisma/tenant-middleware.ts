import { Prisma } from "@/generated/prisma/client";

/**
 * Multi-tenant guardrail. Lanza un Error si una operación sobre un modelo
 * tenant-scoped no incluye `tenantId` explícito en `where` o `data`.
 *
 * Filosofía: defensa en profundidad. CLAUDE.md §4.1 obliga a pasar tenantId
 * explícito en queries; este middleware revienta loud cuando se olvida, antes
 * de que la fuga llegue a producción.
 *
 * Modelos globales (Role, Permission, RolePermission, UserRole, BudgetLine,
 * Tenant) pasan sin filtro porque no tienen columna tenantId — su aislamiento
 * se da por relaciones (User.tenantId, Budget.tenantId, etc.).
 */

// Debe incluir TODO modelo del schema con columna tenantId. El test
// tests/unit/tenant-middleware.test.ts compara este set contra
// prisma/schema.prisma y falla si se desincronizan (p.ej. al agregar un
// modelo nuevo y olvidar registrarlo aquí).
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  "User",
  "LegalEntity",
  "Property",
  "Unit",
  "Lessee",
  "Contract",
  "Rent",
  "Payment",
  "Guarantee",
  "ExpenseCategory",
  "Expense",
  "CadastralPayment",
  "Payroll",
  "Maintenance",
  "Promoter",
  "PromoterLink",
  "Lead",
  "Budget",
  "Document",
  "DocumentTemplate",
  "NotificationLog",
  "AuditLog",
  "MorosityDailySnapshot",
  "Loan",
  "LoanPayment",
  "InvestmentProject",
  "InvestmentPayment",
]);

const READ_OPS: ReadonlySet<string> = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const WHERE_WRITE_OPS: ReadonlySet<string> = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

const CREATE_OPS: ReadonlySet<string> = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
]);

function violation(model: string, op: string, location: "where" | "data"): Error {
  return new Error(
    `Multi-tenant violation: missing tenantId filter on ${model}.${op} (${location}). ` +
      `Pasa tenantId explícito o usa el cliente unsafe si la operación es legítimamente global. Ver CLAUDE.md §4.1.`,
  );
}

/**
 * Acepta tenantId directo (`where: { tenantId }`) o vía compound unique
 * key (`where: { tenantId_email: { tenantId, email } }`).
 */
function whereHasTenantId(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  const obj = where as Record<string, unknown>;
  if (obj["tenantId"] !== undefined && obj["tenantId"] !== null) return true;
  for (const [key, value] of Object.entries(obj)) {
    if (
      (key.startsWith("tenantId_") || key.endsWith("_tenantId") || key.includes("_tenantId_")) &&
      value &&
      typeof value === "object"
    ) {
      const inner = value as Record<string, unknown>;
      if (inner["tenantId"] !== undefined && inner["tenantId"] !== null) return true;
    }
  }
  return false;
}

/**
 * Acepta tenantId directo o relación `tenant: { connect: { id } }`.
 */
function dataHasTenantId(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (obj["tenantId"] !== undefined && obj["tenantId"] !== null) return true;
  const tenant = obj["tenant"];
  if (tenant && typeof tenant === "object") {
    const t = tenant as Record<string, unknown>;
    if (t["connect"] && typeof t["connect"] === "object") return true;
    if (t["create"] && typeof t["create"] === "object") return true;
  }
  return false;
}

export const tenantIsolation = Prisma.defineExtension({
  name: "tenant-isolation",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }

        const op = operation;
        const argsObj = (args ?? {}) as Record<string, unknown>;

        if (READ_OPS.has(op) || WHERE_WRITE_OPS.has(op)) {
          if (!whereHasTenantId(argsObj["where"])) {
            throw violation(model, op, "where");
          }
        }

        if (CREATE_OPS.has(op)) {
          const data = argsObj["data"];
          if (Array.isArray(data)) {
            for (const item of data) {
              if (!dataHasTenantId(item)) throw violation(model, op, "data");
            }
          } else if (!dataHasTenantId(data)) {
            throw violation(model, op, "data");
          }
        }

        if (op === "upsert") {
          if (!whereHasTenantId(argsObj["where"])) throw violation(model, op, "where");
          if (!dataHasTenantId(argsObj["create"])) throw violation(model, op, "data");
        }

        return query(args);
      },
    },
  },
});
