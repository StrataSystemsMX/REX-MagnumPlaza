"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractWizard } from "@/components/contracts/ContractWizard";
import { LesseeForm } from "@/components/forms/LesseeForm";
import { LesseeStatement } from "@/components/lessees/LesseeStatement";
import { NotificationLogTable } from "@/components/lessees/NotificationLogTable";
import { OverdueNoticesPanel } from "@/components/lessees/OverdueNoticesPanel";
import {
  contractStatusLabel,
  contractTypeLabel,
  paymentMethodLabel,
} from "@/lib/i18n/enums";
import { isPlaza, unitWithProperty } from "@/lib/i18n/unit-label";
import type { AvailableUnit } from "@/lib/services/contracts-queries";
import type { LesseeDetail, LesseeOverdueRent } from "@/lib/services/lessees-queries";
import type { NotificationLogRow } from "@/lib/services/notifications-queries";
import type { LesseePayment, LesseeStatement as LesseeStatementData } from "@/lib/services/payments-queries";
import type { ContractStatus } from "@/generated/prisma/enums";
import { formatMXN } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

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
  overdueRents: ReadonlyArray<LesseeOverdueRent>;
  availableUnits: ReadonlyArray<AvailableUnit>;
}

export function LesseeDetailTabs({
  lessee,
  statement,
  payments,
  notifications,
  overdueRents,
  availableUnits,
}: LesseeDetailTabsProps) {
  const router = useRouter();
  const [tab, setTab] = useState("info");
  const [createContractOpen, setCreateContractOpen] = useState(false);
  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div className="flex items-center gap-3">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1">
          <TabsList variant="line">
            <TabsTrigger value="info">Información general</TabsTrigger>
            <TabsTrigger value="contracts">
              Contratos ({lessee.contracts.length})
            </TabsTrigger>
            <TabsTrigger value="statement">Estado de cuenta</TabsTrigger>
            <TabsTrigger value="payments">Pagos históricos ({payments.length})</TabsTrigger>
            <TabsTrigger value="comms">Comunicaciones</TabsTrigger>
          </TabsList>
        </div>
        {tab === "contracts" ? (
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => setCreateContractOpen(true)}
          >
            <Plus className="size-4" />
            Registrar contrato
          </Button>
        ) : null}
      </div>

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
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Vigencia</TableHead>
                <TableHead className="text-right">Renta mensual</TableHead>
                <TableHead className="text-center">Estado</TableHead>
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
                  <TableRow
                    key={c.id}
                    tabIndex={0}
                    role="link"
                    aria-label={`Ver contrato ${c.id.slice(-8)}`}
                    className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    onMouseEnter={() => router.prefetch(`/contracts/${c.id}`)}
                    onFocus={() => router.prefetch(`/contracts/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/contracts/${c.id}`);
                      }
                    }}
                  >
                    <TableCell className="font-mono text-xs">
                      {c.id.slice(-8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-medium">{c.unit.property.name}</p>
                      {isPlaza(c.unit.property.type) ? (
                        <p className="text-xs text-muted-foreground">
                          {c.unit.code}
                          {c.unit.name ? ` — ${c.unit.name}` : ""}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{contractTypeLabel(c.type)}</TableCell>
                    <TableCell className="text-center text-xs">
                      {formatDate(c.startDate)} → {formatDate(c.endDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMXN(c.monthlyAmount, 2)}
                    </TableCell>
                    <TableCell className="text-center">
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

        <ContractWizard
          availableUnits={availableUnits}
          open={createContractOpen}
          onOpenChange={setCreateContractOpen}
          onCreated={() => router.refresh()}
          initialLessee={{ id: lessee.id, legalName: lessee.legalName }}
        />
      </TabsContent>

      <TabsContent value="statement" className="mt-4">
        <LesseeStatement data={statement} />
      </TabsContent>

      <TabsContent value="payments" className="mt-4 space-y-3">
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">Fecha</TableHead>
                <TableHead>Inmueble · Unidad</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-center">Método</TableHead>
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
                    <TableCell className="text-center text-xs tabular-nums">
                      {formatDate(p.paymentDate)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {unitWithProperty(p.rent.contract.unit, " ")}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {p.rent.period.toISOString().slice(0, 7)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMXN(p.amount, 2)}
                    </TableCell>
                    <TableCell className="text-center">
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

      <TabsContent value="comms" className="mt-4 space-y-4">
        <OverdueNoticesPanel
          lessee={{
            legalName: lessee.legalName,
            whatsapp: lessee.whatsapp,
            email: lessee.email,
            preferredChannel: lessee.preferredChannel,
          }}
          rents={overdueRents}
        />
        <NotificationLogTable logs={notifications} />
      </TabsContent>
    </Tabs>
  );
}
