/**
 * Arranque de producción: deja una base recién migrada lista para entrar,
 * sin datos operativos. Idempotente y nunca borra; se puede volver a correr
 * para dar de alta usuarios nuevos.
 *
 *  1. Roles, permisos y su asignación (catalog-sync).
 *  2. Tenant "Plazas Magnum".
 *  3. Razones sociales y categorías de egreso (tenant-catalog-data). Si ya
 *     existen no se sobrescriben: pudieron editarse desde la app.
 *  4. Usuarios pasados con --user. Si el correo ya existe, solo se asegura
 *     el rol. Se vinculan a Clerk por correo en su primer inicio de sesión
 *     (getSession), así que también deben estar invitados en Clerk.
 *
 * Inmuebles, locales, inquilinos, contratos y pagos se capturan en la app.
 * El seed NO es para producción: borra y recrea el tenant.
 *
 * Uso:
 *   pnpm db:bootstrap --user "correo@dominio.com:MASTER:Nombre Apellido" [--user ...]
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Plan, RoleCode } from "../src/generated/prisma/enums";
import { syncRolesAndPermissions } from "./catalog-sync";
import {
  EXPENSE_CATEGORIES,
  LEGAL_ENTITIES,
  TENANT_NAME,
  TENANT_SLUG,
} from "./tenant-catalog-data";

interface UserInput {
  email: string;
  role: RoleCode;
  name: string;
}

const ROLE_CODES = Object.values(RoleCode);

function parseUsers(argv: string[]): UserInput[] {
  const users: UserInput[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--user") continue;
    const raw = argv[i + 1] ?? "";
    const [email = "", role = "", ...nameParts] = raw.split(":");
    const name = nameParts.join(":").trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error(`--user "${raw}": correo inválido. Formato: correo:ROL:Nombre`);
    }
    if (!ROLE_CODES.includes(role as RoleCode)) {
      throw new Error(`--user "${raw}": rol inválido. Usa uno de ${ROLE_CODES.join(", ")}`);
    }
    if (!name) {
      throw new Error(`--user "${raw}": falta el nombre. Formato: correo:ROL:Nombre`);
    }
    users.push({ email: normalizedEmail, role: role as RoleCode, name });
    i += 1;
  }
  return users;
}

const users = parseUsers(process.argv.slice(2));

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const catalog = await syncRolesAndPermissions(prisma);
  console.log(
    `[bootstrap] ${catalog.roles} roles, ${catalog.permissions} permisos, ${catalog.assignments} asignaciones.`,
  );

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      plan: Plan.STARTER,
      timezone: "America/Hermosillo",
      currency: "MXN",
    },
  });
  console.log(`[bootstrap] Tenant "${tenant.name}" (${tenant.slug}).`);

  for (const le of LEGAL_ENTITIES) {
    await prisma.legalEntity.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: le.code } },
      update: {},
      create: { ...le, tenantId: tenant.id },
    });
  }
  console.log(`[bootstrap] ${LEGAL_ENTITIES.length} razones sociales.`);

  for (const c of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      update: {},
      create: { ...c, tenantId: tenant.id },
    });
  }
  console.log(`[bootstrap] ${EXPENSE_CATEGORIES.length} categorías de egreso.`);

  for (const u of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: { tenantId: tenant.id, email: u.email, name: u.name },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    console.log(`[bootstrap] Usuario ${u.email} con rol ${u.role}.`);
  }
  if (users.length === 0) {
    console.log("[bootstrap] Sin --user: no se dieron de alta usuarios.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
