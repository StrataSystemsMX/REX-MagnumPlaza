"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ContractDocumentManager } from "@/components/contracts/ContractDocumentManager";
import { ContractNotesCard } from "@/components/contracts/ContractNotesCard";
import {
  auditActionLabel,
  contractTypeLabel,
  guaranteeStatusLabel,
} from "@/lib/i18n/enums";
import { isPlaza, unitCode } from "@/lib/i18n/unit-label";
import type {
  ContractAuditEntry,
  ContractDetail,
} from "@/lib/services/contracts-queries";
import { describeAuditDetail } from "@/lib/audit/describe";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "long",
  day: "2-digit",
  timeZone: "UTC",
});

const DATETIME = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface ContractDetailTabsProps {
  contract: ContractDetail;
  auditLog: ReadonlyArray<ContractAuditEntry>;
  canEditDocuments: boolean;
}

export function ContractDetailTabs({
  contract,
  auditLog,
  canEditDocuments,
}: ContractDetailTabsProps) {
  return (
    <Tabs defaultValue="summary" className="w-full">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList variant="line">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="documents">
            Documentos ({contract.documents.length})
          </TabsTrigger>
          <TabsTrigger value="guarantee">Fianza</TabsTrigger>
          <TabsTrigger value="audit">Auditoría</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="summary" className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Unidad">
            <p className="font-medium">{contract.unit.property.name}</p>
            {/* El nombre del inmueble ya identifica un inmueble individual; el
                código de local solo se muestra en plazas. */}
            {isPlaza(contract.unit.property.type) ? (
              <p className="text-sm text-muted-foreground">
                {unitCode(contract.unit)}
                {contract.unit.name ? ` — ${contract.unit.name}` : ""}
              </p>
            ) : null}
            {(contract.unit.childUnits ?? []).length > 0 ? (
              <p className="mt-1 text-xs text-emerald-700">
                Cubre {(contract.unit.childUnits ?? []).length + 1} locales
                agrupados físicamente.
              </p>
            ) : null}
            <div className="mt-3 space-y-1 text-xs">
              <Row label="Dueña">
                <span className="font-medium">
                  {contract.unit.property.ownerEntity.code}
                </span>
              </Row>
              <Row label="Administra">
                <span className="font-medium">
                  {contract.unit.property.managerEntity.code}
                </span>
              </Row>
            </div>
          </Card>

          <Card title="Términos">
            <Row label="Tipo">{contractTypeLabel(contract.type)}</Row>
            <Row label="Renta mensual">
              <span className="font-medium tabular-nums">
                {MXN.format(Number(contract.monthlyAmount))}
              </span>
            </Row>
            <Row label="Vigencia">
              <span className="tabular-nums">
                {capitalizeFirst(DATE.format(contract.startDate))} → {capitalizeFirst(DATE.format(contract.endDate))}
              </span>
            </Row>
            <Row label="Día de cobro">{contract.paymentDay}</Row>
            {contract.lateFeePercentage !== null ? (
              <Row label="Interés moratorio">
                {Number(contract.lateFeePercentage).toFixed(2)}%
              </Row>
            ) : null}
            <Row label="Auto-renovación">
              {contract.autoRenew ? "Sí" : "No"}
            </Row>
            {contract.paidInAdvance ? (
              <Row label="Pago adelantado">
                Sí{" "}
                {contract.advancePaidUntil
                  ? `· hasta ${capitalizeFirst(DATE.format(contract.advancePaidUntil))}`
                  : ""}
              </Row>
            ) : null}
          </Card>
        </div>

        <ContractNotesCard contractId={contract.id} notes={contract.notes} />

      </TabsContent>

      <TabsContent value="documents" className="mt-4">
        <ContractDocumentManager
          contractId={contract.id}
          documents={contract.documents}
          canEdit={canEditDocuments}
        />
      </TabsContent>

      <TabsContent value="guarantee" className="mt-4">
        <div className="rounded-lg border bg-card p-6">
          {contract.guarantees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se ha registrado fianza para este contrato.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {contract.guarantees.map((g) => (
                <li key={g.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium tabular-nums">
                      {MXN.format(Number(g.amount))}
                    </span>
                    <Badge variant="secondary">
                      {guaranteeStatusLabel(g.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recibido: {capitalizeFirst(DATE.format(g.receivedDate))}
                    {g.returnedDate
                      ? ` · Devuelto: ${capitalizeFirst(DATE.format(g.returnedDate))}`
                      : ""}
                  </p>
                  {g.notes ? <p className="mt-1 text-xs">{g.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabsContent>

      <TabsContent value="audit" className="mt-4">
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Fecha
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Usuario
                </TableHead>
                <TableHead className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Acción
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Detalle
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Sin movimientos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                auditLog.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-center text-xs tabular-nums">
                      {capitalizeFirst(DATETIME.format(a.createdAt))}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.user?.name ?? a.user?.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{auditActionLabel(a.action)}</Badge>
                    </TableCell>
                    <TableCell
                      className="text-sm text-muted-foreground"
                      // El JSON crudo sigue disponible al pasar el cursor, por si
                      // se necesita el detalle exacto para una revisión.
                      title={a.changes ? JSON.stringify(a.changes) : undefined}
                    >
                      {describeAuditDetail({
                        action: a.action,
                        entityType: "Contract",
                        changes: a.changes,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-5">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
