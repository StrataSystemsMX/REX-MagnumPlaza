"use client";

import { FileDown, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RegisterPaymentDialog,
  type RegisterPaymentDialogContext,
} from "@/components/collections/RegisterPaymentDialog";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import { contractStatusLabel, paymentMethodLabel } from "@/shared/i18n/enums";
import { isPlaza, unitWithProperty } from "@/shared/i18n/unit-label";
import type { LesseeStatement as LesseeStatementData } from "@/server/services/payments-queries";
import { formatMXN } from "@/shared/format-currency";
import { formatDate, formatPeriodShort } from "@/shared/format-date";

interface LesseeStatementProps {
  data: LesseeStatementData;
}

export function LesseeStatement({ data }: LesseeStatementProps) {
  const [paymentContext, setPaymentContext] = useState<RegisterPaymentDialogContext | null>(
    null,
  );
  // Plazo del estado de cuenta: "all" = todo el historial; "6"/"12" = ventana móvil.
  const [statementMonths, setStatementMonths] = useState<string>("all");
  const { lessee, summary, lastPayment } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Saldo total adeudado">
          <span className="text-2xl font-semibold tabular-nums text-destructive">
            {formatMXN(summary.total, 2)}
          </span>
        </SummaryCard>
        <SummaryCard label="Meses vencidos (≥30d)">
          <span className="text-2xl font-semibold tabular-nums">
            {summary.overdueCount}
          </span>
        </SummaryCard>
        <SummaryCard label="Pagos parciales">
          <span className="text-2xl font-semibold tabular-nums">
            {summary.partialCount}
          </span>
        </SummaryCard>
        <SummaryCard label="Último pago">
          {lastPayment ? (
            <>
              <span className="text-base font-semibold tabular-nums">
                {formatMXN(lastPayment.amount, 2)}
              </span>
              <p className="text-xs text-muted-foreground">
                {formatDate(lastPayment.paymentDate)} ·{" "}
                {paymentMethodLabel(lastPayment.method)}
              </p>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Sin pagos registrados.</span>
          )}
        </SummaryCard>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Plazo:</span>
          <Select
            value={statementMonths}
            onValueChange={(v) => setStatementMonths(v ?? "all")}
          >
            <SelectTrigger className="w-[180px]" aria-label="Plazo del estado de cuenta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el historial</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            const params = new URLSearchParams({ lesseeId: lessee.id });
            if (statementMonths !== "all") params.set("months", statementMonths);
            window.open(
              `/api/documents/account-statement?${params.toString()}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
        >
          <FileDown className="size-4" />
          Generar PDF de estado de cuenta
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.info("Envío por WhatsApp llegará en Prompt 9.")}
        >
          <MessageCircle className="size-4" />
          Enviar recordatorio por WhatsApp
        </Button>
      </div>

      {lessee.contracts.map((c) => {
        const totalDue = c.rents.reduce((acc, r) => acc + Number(r.amountDue), 0);
        const totalPaid = c.rents.reduce((acc, r) => acc + Number(r.amountPaid), 0);
        return (
          <div key={c.id} className="space-y-2 rounded-md border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {isPlaza(c.unit.property.type) ? (
                    <>
                      {c.unit.property.name} — {c.unit.code}
                      {c.unit.name ? ` (${c.unit.name})` : ""}
                    </>
                  ) : (
                    c.unit.property.name
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Contrato {c.id.slice(-8)} ·{" "}
                  <Badge variant="secondary">{contractStatusLabel(c.status)}</Badge>
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-xs text-muted-foreground">Cargado / Pagado</p>
                <p className="tabular-nums">
                  {formatMXN(totalDue, 2)} /{" "}
                  <span className="font-semibold">{formatMXN(totalPaid, 2)}</span>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Periodo</TableHead>
                  <TableHead className="text-center">Vence</TableHead>
                  <TableHead className="text-right">Cargo</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.rents.map((r) => {
                  const balance =
                    Number(r.amountDue) - Number(r.amountPaid) - Number(r.amountWaived ?? 0);
                  const isPayable = balance > 0 && r.status !== "WAIVED";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-center text-sm">
                        {formatPeriodShort(r.period)}
                      </TableCell>
                      <TableCell className="text-center text-xs">{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMXN(r.amountDue, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatMXN(r.amountPaid, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMXN(balance, 2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <RentStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {isPayable ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPaymentContext({
                                rentId: r.id,
                                amountDue: r.amountDue.toString(),
                                amountPaid: r.amountPaid.toString(),
                                period: r.period,
                                lesseeName: lessee.legalName,
                                unitLabel: unitWithProperty(c.unit, " "),
                              })
                            }
                          >
                            Pagar
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </div>
        );
      })}

      <RegisterPaymentDialog
        context={paymentContext}
        open={paymentContext !== null}
        onOpenChange={(o) => !o && setPaymentContext(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
