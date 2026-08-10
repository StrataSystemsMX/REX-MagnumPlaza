import { Link2, Star, UserCheck, Users } from "lucide-react";
import { NewPromoterDialog } from "@/components/promoters/NewPromoterDialog";
import { PromotersTable } from "@/components/promoters/PromotersTable";
import { MetricCard } from "@/components/shared/metric-card";
import { requireAuth } from "@/server/auth/get-session";
import { hasPermission } from "@/server/auth/permissions";
import {
  getAvailableUnitsForPromoterLink,
  getPromoters,
} from "@/server/services/promoters-queries";

export default async function PromotoresPage() {
  const { dbUser } = await requireAuth();

  const [promoters, units, canManage] = await Promise.all([
    getPromoters(),
    getAvailableUnitsForPromoterLink(),
    hasPermission(dbUser.id, "expense.create"),
  ]);

  const active = promoters.filter((p) => p.isActive);
  const totalLinks = promoters.reduce((acc, p) => acc + p.links.length, 0);
  const rentedViaPromoter = promoters.reduce(
    (acc, p) => acc + p.links.filter((l) => l.resultedInRent).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Promotores</h1>
        {canManage && <NewPromoterDialog />}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Promotores activos"
          value={active.length}
          subValue={`de ${promoters.length} registrados`}
          icon={Users}
        />
        <MetricCard
          label="Links activos"
          value={totalLinks}
          subValue="locales compartidos"
          icon={Link2}
          color={totalLinks > 0 ? "warning" : "default"}
        />
        <MetricCard
          label="Locales disponibles"
          value={units.length}
          subValue="para compartir con promotores"
          icon={UserCheck}
        />
        <MetricCard
          label="Contratos cerrados"
          value={rentedViaPromoter}
          subValue="originados por promotor"
          icon={Star}
          color={rentedViaPromoter > 0 ? "success" : "default"}
        />
      </div>

      <PromotersTable promoters={promoters} units={units} canManage={canManage} />
    </div>
  );
}
