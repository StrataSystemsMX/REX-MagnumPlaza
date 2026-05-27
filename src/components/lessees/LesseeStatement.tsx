"use client";

import { FileDown, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  RegisterPaymentDialog,
  type RegisterPaymentDialogContext,
} from "@/components/collections/RegisterPaymentDialog";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import { contractStatusLabel, paymentMethodLabel } from "@/lib/i18n/enums";
import { isPlaza, unitWithProperty } from "@/lib/i18n/unit-label";
import type { LesseeStatement as LesseeStatementData } from "@/lib/services/payments-queries";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface LesseeStatementProps {
  data: LesseeStatementData;
}

export function LesseeStatement({ data }: LesseeStatementProps) {
  const [paymentContext, setPaymentContext] = useState<RegisterPaymentDialogContext | null>(
    null,
  );
  const { lessee, summary, lastPayment } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Saldo total adeudado">
          <span className="text-2xl font-semibold tabular-nums text-destructive">
            {MXN.format(Number(summary.total))}
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
                {MXN.format(Number(lastPayment.amount))}
              </span>
              <p className="text-xs text-muted-foreground">
                {capitalizeFirst(DATE.format(lastPayment.paymentDate))} ·{" "}
                {paymentMethodLabel(lastPayment.method)}
              </p>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Sin pagos registrados.</span>
          )}
        </SummaryCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const url = `/api/documents/account-statement?lesseeId=${encodeURIComponent(lessee.id)}`;
            window.open(url, "_blank", "noopener,noreferrer");
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
                  {MXN.format(totalDue)} /{" "}
                  <span className="font-semibold">{MXN.format(totalPaid)}</span>
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
                        {capitalizeFirst(PERIOD.format(r.period))}
                      </TableCell>
                      <TableCell className="text-center text-xs">{capitalizeFirst(DATE.format(r.dueDate))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {MXN.format(Number(r.amountDue))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {MXN.format(Number(r.amountPaid))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {MXN.format(balance)}
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
