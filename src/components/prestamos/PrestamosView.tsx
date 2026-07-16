"use client";

import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewLoanDialog } from "@/components/prestamos/NewLoanDialog";
import { cn } from "@/lib/utils";
import type { LoanRow } from "@/lib/services/prestamos-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";
import { formatMXN } from "@/lib/format-currency";

const DATE_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const LOAN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activo",
  PAID_OFF: "Liquidado",
  REFINANCED: "Refinanciado",
  DEFAULTED: "Incumplimiento",
  CANCELLED: "Cancelado",
};

const ENTITY_BADGE: Record<string, string> = {
  CRT: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  TSR: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  QHS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

interface Props {
  loans: LoanRow[];
  legalEntities: ReadonlyArray<LegalEntityOption>;
  canCreate: boolean;
}

export function PrestamosView({ loans, legalEntities, canCreate }: Props) {
  const active = loans.filter((l) => l.status === "ACTIVE");
  const totalActive = active.reduce((s, l) => s + l.amount, 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">Préstamos activos</p>
            <p className="text-2xl font-semibold">{active.length}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">Total prestado activo</p>
            <p className="text-2xl font-semibold tabular-nums">{formatMXN(totalActive)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Header + button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-base font-semibold">
          <CreditCard className="size-4 text-muted-foreground" />
          Préstamos registrados
        </div>
        {canCreate && <NewLoanDialog legalEntities={legalEntities} />}
      </div>

      {/* Table */}
      {loans.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No hay préstamos registrados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Prestamista</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">{loan.name}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        ENTITY_BADGE[loan.entityCode] ?? "bg-slate-100 text-slate-700",
                      )}
                    >
                      {loan.entityCode}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {loan.lender ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {DATE_FMT.format(loan.date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMXN(loan.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={loan.status === "ACTIVE" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {LOAN_STATUS_LABEL[loan.status] ?? loan.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
