import { ShieldCheck, ShieldOff, ShieldAlert, Wallet } from "lucide-react";
import { GuaranteesTable } from "@/components/guarantees/GuaranteesTable";
import { NewGuaranteeDialog } from "@/components/guarantees/NewGuaranteeDialog";
import { MetricCard } from "@/components/shared/metric-card";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getContractsWithoutGuarantee,
  getGuarantees,
} from "@/lib/services/guarantees-queries";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default async function FianzasPage() {
  const { dbUser } = await requireAuth();

  const [guarantees, contracts, canManage] = await Promise.all([
    getGuarantees(),
    getContractsWithoutGuarantee(),
    hasPermission(dbUser.id, "expense.create"),
  ]);

  const held = guarantees.filter((g) => g.status === "HELD" || g.status === "PARTIALLY_RETURNED");
  const returned = guarantees.filter((g) => g.status === "RETURNED");
  const applied = guarantees.filter((g) => g.status === "APPLIED_TO_DEBT");

  const totalHeld = held.reduce((acc, g) => acc + g.amount, 0);
  const totalReturned = returned.reduce((acc, g) => acc + (g.returnedAmount ?? g.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Fianzas</h1>
        {canManage && <NewGuaranteeDialog contracts={contracts} />}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="En custodia"
          value={<span className="tabular-nums">{MXN.format(totalHeld)}</span>}
          subValue={`${held.length} fianza${held.length === 1 ? "" : "s"}`}
          icon={ShieldAlert}
          color={held.length > 0 ? "warning" : "default"}
        />
        <MetricCard
          label="Total registrado"
          value={guarantees.length}
          subValue="fianzas históricas"
          icon={Wallet}
        />
        <MetricCard
          label="Devueltos"
          value={returned.length}
          subValue={returned.length > 0 ? MXN.format(totalReturned) : "Sin devoluciones"}
          icon={ShieldCheck}
          color={returned.length > 0 ? "success" : "default"}
        />
        <MetricCard
          label="Aplicados a deuda"
          value={applied.length}
          subValue="usados para saldar adeudo"
          icon={ShieldOff}
          color={applied.length > 0 ? "danger" : "default"}
        />
      </div>

      <GuaranteesTable guarantees={guarantees} canManage={canManage} />
    </div>
  );
}
