"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HistorialFilters } from "@/components/historial/HistorialFilters";
import { UndoChangeButton } from "@/components/historial/UndoChangeButton";
import { auditCategoryLabel, categoryOf } from "@/shared/audit/categories";
import { describeAuditDetail } from "@/shared/audit/describe";
import { auditActionLabel } from "@/shared/i18n/enums";
import { capitalizeFirst } from "@/shared/utils";
import type { AuditLogPage } from "@/server/services/audit";
import type { AuditAction } from "@/generated/prisma/enums";

const DATETIME = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface Props {
  data: AuditLogPage;
  users: ReadonlyArray<UserOption>;
  canUndo: boolean;
}

/** Color por acción para el badge (verde=creó, ámbar=modificó, rojo=eliminó, azul=restauró). */
function actionBadgeClass(action: AuditAction): string {
  switch (action) {
    case "CREATE":
      return "bg-green-500/12 text-green-700 dark:bg-green-500/15 dark:text-green-300";
    case "UPDATE":
      return "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
    case "DELETE":
      return "bg-destructive/12 text-destructive";
    case "RESTORE":
      return "bg-blue-500/12 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function HistorialCambiosView({ data, users, canUndo }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entries, page, pageCount, total } = data;

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <HistorialFilters users={users} />

      {/* Tabla */}
      <div className="overflow-hidden rounded-lg border bg-card">
        {/* table-fixed + colgroup: las columnas no se reacomodan al filtrar. */}
        <Table className="table-fixed">
          <colgroup>
            <col className="w-44" />
            <col className="w-40" />
            <col className="w-36" />
            <col className="w-28" />
            <col />
            <col className="w-28" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fecha
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Usuario
              </TableHead>
              <TableHead className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Área
              </TableHead>
              <TableHead className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Acción
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Detalle
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Sin movimientos registrados.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">
                    {capitalizeFirst(DATETIME.format(new Date(e.createdAt)))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.user?.name ?? e.user?.email ?? "Sistema"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {auditCategoryLabel(categoryOf(e.entityType))}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className={actionBadgeClass(e.action)}>
                      {auditActionLabel(e.action)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-sm text-muted-foreground"
                    // El JSON crudo queda disponible al pasar el cursor, por si se
                    // necesita el detalle exacto para una revisión.
                    title={e.changes ? JSON.stringify(e.changes) : undefined}
                  >
                    {describeAuditDetail({
                      action: e.action,
                      entityType: e.entityType,
                      changes: e.changes,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <UndoChangeButton entry={e} canUndo={canUndo} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {total} {total === 1 ? "movimiento" : "movimientos"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="tabular-nums">
              Página {page} de {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => goToPage(page + 1)}
              className="gap-1"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
