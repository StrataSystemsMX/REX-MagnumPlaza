import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";

export default async function ReportsPage() {
  const { dbUser, tenantId } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);

  const isPromoter = roles.includes("PROMOTER");
  const isLessee = roles.includes("LESSEE");
  if (isPromoter || isLessee) redirect(isPromoter ? "/promoter" : "/portal");

  const canSeeAll =
    roles.includes("MASTER") ||
    roles.includes("ADMIN") ||
    roles.includes("ACCOUNTANT") ||
    roles.includes("OWNER");
  if (!canSeeAll) redirect("/");

  const legalEntities = await prisma.legalEntity.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, legalName: true, rfc: true },
    orderBy: { code: "asc" },
  });

  const year = new Date().getUTCFullYear();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona una razón social para ver sus ingresos, egresos y margen anual.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {legalEntities.map((entity) => (
          <Link
            key={entity.id}
            href={`/legal-entity/${entity.id}?year=${year}`}
            className="group flex items-start justify-between rounded-lg border bg-card p-5 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <div className="min-w-0">
              <p className="text-lg font-bold">{entity.code}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground group-hover:text-accent-foreground/70">
                {entity.legalName}
              </p>
              {entity.rfc && (
                <p className="mt-1.5 text-xs text-muted-foreground group-hover:text-accent-foreground/60">
                  RFC {entity.rfc}
                </p>
              )}
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
