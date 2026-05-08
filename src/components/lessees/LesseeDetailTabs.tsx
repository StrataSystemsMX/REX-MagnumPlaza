"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LesseeForm } from "@/components/forms/LesseeForm";
import { LesseeStatement } from "@/components/lessees/LesseeStatement";
import { NotificationLogTable } from "@/components/lessees/NotificationLogTable";
import {
  contractStatusLabel,
  contractTypeLabel,
  paymentMethodLabel,
} from "@/lib/i18n/enums";
import type { LesseeDetail } from "@/lib/services/lessees-queries";
import type { NotificationLogRow } from "@/lib/services/notifications-queries";
import type { LesseePayment, LesseeStatement as LesseeStatementData } from "@/lib/services/payments-queries";
import type { ContractStatus } from "@/generated/prisma/enums";
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

function statusVariant(s: ContractStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "ACTIVE":
      return "default";
    case "DRAFT":
    case "PENDING_RENEWAL":
      return "secondary";
    case "EXPIRED":
    case "TERMINATED":
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

interface LesseeDetailTabsProps {
  lessee: LesseeDetail;
  statement: LesseeStatementData;
  payments: ReadonlyArray<LesseePayment>;
  notifications: ReadonlyArray<NotificationLogRow>;
}

export function LesseeDetailTabs({
  lessee,
  statement,
  payments,
  notifications,
}: LesseeDetailTabsProps) {
  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList>
        <TabsTrigger value="info">Información general</TabsTrigger>
        <TabsTrigger value="contracts">
          Contratos ({lessee.contracts.length})
        </TabsTrigger>
        <TabsTrigger value="statement">Estado de cuenta</TabsTrigger>
        <TabsTrigger value="payments">Pagos históricos ({payments.length})</TabsTrigger>
        <TabsTrigger value="comms">Comunicaciones</TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="mt-4 rounded-md border bg-card p-6">
        <LesseeForm
          initial={{
            id: lessee.id,
            legalName: lessee.legalName,
            contactName: lessee.contactName,
            rfc: lessee.rfc,
            email: lessee.email,
            phone: lessee.phone,
            whatsapp: lessee.whatsapp,
            preferredChannel: lessee.preferredChannel,
            notes: lessee.notes,
          }}
          submitLabel="Guardar cambios"
        />
      </TabsContent>

      <TabsContent value="contracts" className="mt-4 space-y-3">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-right">Renta mensual</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessee.contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Este inquilino aún no tiene contratos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                lessee.contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/contracts/${c.id}`}
                        className="hover:underline"
                      >
                        {c.id.slice(-8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-medium">{c.unit.property.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.unit.code}
                        {c.unit.name ? ` — ${c.unit.name}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{contractTypeLabel(c.type)}</TableCell>
                    <TableCell className="text-xs">
                      {capitalizeFirst(DATE.format(c.startDate))} → {capitalizeFirst(DATE.format(c.endDate))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {MXN.format(Number(c.monthlyAmount))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)}>
                        {contractStatusLabel(c.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="statement" className="mt-4">
        <LesseeStatement data={statement} />
      </TabsContent>

      <TabsContent value="payments" className="mt-4 space-y-3">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Inmueble · Unidad</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Referencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Sin pagos registrados todavía.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs tabular-nums">
                      {capitalizeFirst(DATE.format(p.paymentDate))}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.rent.contract.unit.property.name} {p.rent.contract.unit.code}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {p.rent.period.toISOString().slice(0, 7)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {MXN.format(Number(p.amount))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{paymentMethodLabel(p.method)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="comms" className="mt-4 space-y-3">
        <NotificationLogTable logs={notifications} />
      </TabsContent>
    </Tabs>
  );
}
