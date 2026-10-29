import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/get-session";
import { canAccessAudit } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { getAuditLog } from "@/server/services/audit";
import { AUDIT_CATEGORIES, type AuditCategory } from "@/shared/audit/categories";
import { HistorialCambiosView } from "@/components/historial/HistorialCambiosView";
import type { AuditAction } from "@/generated/prisma/enums";

const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "RESTORE"] as const;

function parseDateStart(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HistorialPage({ searchParams }: PageProps) {
  // Historial restringido a MASTER/ADMIN (mismo gate que el botón del topbar).
  const { tenantId, dbUser } = await requireAuth();
  const allowed = await canAccessAudit(dbUser.id);
  if (!allowed) notFound();

  const sp = await searchParams;
  const str = (k: string): string | undefined =>
    typeof sp[k] === "string" ? (sp[k] as string) : undefined;

  const categoryRaw = str("category");
  const category = AUDIT_CATEGORIES.includes(categoryRaw as AuditCategory)
    ? (categoryRaw as AuditCategory)
    : undefined;

  const actionRaw = str("action");
  const action = AUDIT_ACTIONS.includes(actionRaw as (typeof AUDIT_ACTIONS)[number])
    ? (actionRaw as AuditAction)
    : undefined;

  const userId = str("userId");
  const from = parseDateStart(str("from"));
  const to = parseDateEnd(str("to"));
  const pageNum = Number(str("page"));
  const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;

  const [data, users] = await Promise.all([
    getAuditLog({ category, action, userId, from, to, page }),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-blue-400/22 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-blue-800/18">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historial de Cambios</h1>
        <p className="text-sm text-muted-foreground">
          Movimientos que afectan la base de datos: quién hizo qué y cuándo.
        </p>
      </div>

      <HistorialCambiosView data={data} users={users} canUndo={allowed} />
    </div>
  );
}
