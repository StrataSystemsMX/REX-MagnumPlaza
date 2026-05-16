/**
 * One-off: corrige el typo "Interio" → "Interior" en datos existentes.
 * Uso: pnpm tsx --env-file=.env.local scripts/fix-interio-typo.ts
 */
import { prismaUnsafe } from "../src/lib/prisma/client";

async function main(): Promise<void> {
  const units = await prismaUnsafe.unit.updateMany({
    where: { name: "Interio" },
    data: { name: "Interior" },
  });
  const units2 = await prismaUnsafe.unit.updateMany({
    where: { name: "Interio 2" },
    data: { name: "Interior 2" },
  });
  const lessees = await prismaUnsafe.lessee.updateMany({
    where: { legalName: "Interio" },
    data: { legalName: "Interior" },
  });

  console.log(
    `Actualizados: units(name='Interio')=${units.count}, units(name='Interio 2')=${units2.count}, lessees(legalName='Interio')=${lessees.count}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prismaUnsafe.$disconnect();
  });
