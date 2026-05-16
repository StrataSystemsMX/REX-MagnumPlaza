/**
 * One-off: lista todos los users del tenant y opcionalmente asigna MASTER.
 * Uso:
 *   pnpm tsx --env-file=.env.local scripts/grant-master.ts            # listar
 *   pnpm tsx --env-file=.env.local scripts/grant-master.ts <userId>   # asignar MASTER
 */
import { prismaUnsafe } from "../src/lib/prisma/client";

async function main(): Promise<void> {
  const target = process.argv[2];

  const users = await prismaUnsafe.user.findMany({
    select: {
      id: true,
      email: true,
      tenantId: true,
      clerkId: true,
      createdAt: true,
      roles: { select: { role: { select: { code: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total users en DB: ${users.length}`);
  for (const u of users) {
    console.log(
      `  - id=${u.id}  email=${u.email}  clerkId=${u.clerkId ?? "<null>"}  roles=[${u.roles.map((r) => r.role.code).join(",")}]`,
    );
  }

  if (!target) {
    console.log("\n(modo lista — pasa un userId como argumento para asignar MASTER)");
    return;
  }

  const masterRole = await prismaUnsafe.role.findUnique({
    where: { code: "MASTER" },
  });
  if (!masterRole) {
    throw new Error("Role MASTER no existe. Corre `pnpm db:seed` primero.");
  }

  const u = users.find((x) => x.id === target);
  if (!u) {
    throw new Error(`No existe User con id=${target}`);
  }
  if (u.roles.some((r) => r.role.code === "MASTER")) {
    console.log(`User ${u.id} ya es MASTER.`);
    return;
  }
  await prismaUnsafe.userRole.create({
    data: { userId: u.id, roleId: masterRole.id },
  });
  console.log(`✓ Asignado MASTER a user ${u.id} (${u.email}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
