import { PrestamosView } from "@/components/prestamos/PrestamosView";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { getLoans } from "@/lib/services/prestamos-queries";
import { getLegalEntities } from "@/lib/services/properties-queries";

export const metadata = { title: "Préstamos" };

export default async function PrestamosPage() {
  const { dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);
  const canCreate =
    roles.includes("MASTER") || roles.includes("ADMIN") || roles.includes("ACCOUNTANT") || roles.length === 0;

  const [loans, legalEntities] = await Promise.all([
    getLoans(),
    getLegalEntities(),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-blue-400/15 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-blue-800/12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Préstamos</h1>
        <p className="text-sm text-muted-foreground">
          Financiamientos y créditos activos de la empresa.
        </p>
      </div>
      <PrestamosView loans={loans} legalEntities={legalEntities} canCreate={canCreate} />
    </div>
  );
}
