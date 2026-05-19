import { InversionesView } from "@/components/inversiones/InversionesView";
import {
  getInversionesKpis,
  getInvestmentProjects,
} from "@/lib/services/inversiones-queries";

export const metadata = { title: "Inversiones" };

export default async function InversionesPage() {
  const [kpis, projects] = await Promise.all([
    getInversionesKpis(),
    getInvestmentProjects(),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-blue-400/15 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-blue-800/12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inversiones</h1>
        <p className="text-sm text-muted-foreground">
          Proyectos de inversión y avance presupuestal.
        </p>
      </div>
      <InversionesView kpis={kpis} projects={projects} />
    </div>
  );
}
