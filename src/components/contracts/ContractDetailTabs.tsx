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
import { ContractActions } from "@/components/contracts/ContractActions";
import { ContractDocumentManager } from "@/components/contracts/ContractDocumentManager";
import { RentCalendar } from "@/components/contracts/RentCalendar";
import {
  auditActionLabel,
  contractStatusLabel,
  contractStatusVariant,
  contractTypeLabel,
  guaranteeStatusLabel,
} from "@/lib/i18n/enums";
import type {
  ContractAuditEntry,
  ContractDetail,
} from "@/lib/services/contracts-queries";

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
      <TabsList>
        <TabsTrigger value="summary">Resumen</TabsTrigger>
        <TabsTrigger value="rents">Rentas y pagos</TabsTrigger>
        <TabsTrigger value="documents">Documentos</TabsTrigger>
        <TabsTrigger value="guarantee">Garantía</TabsTrigger>
        <TabsTrigger value="audit">Auditoría</TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Inquilino">
            <p className="font-medium">{contract.lessee.legalName}</p>
            {contract.lessee.contactName ? (
              <p className="text-sm text-muted-foreground">
                {contract.lessee.contactName}
              </p>
            ) : null}
            {contract.lessee.rfc ? (
              <p className="text-xs text-muted-foreground font-mono">
                RFC: {contract.lessee.rfc}
              </p>
            ) : null}
          </Card>
          <Card title="Unidad">
            <p className="font-medium">{contract.unit.property.name}</p>
            <p className="text-sm text-muted-foreground">
              {contract.unit.code}
              {contract.unit.name ? ` — ${contract.unit.name}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dueña <span className="font-medium">{contract.unit.property.ownerEntity.code}</span> ·
              Administra{" "}
              <span className="font-medium">{contract.unit.property.managerEntity.code}</span>
            </p>
          </Card>
          <Card title="Términos">
            <Row label="Tipo">{contractTypeLabel(contract.type)}</Row>
            <Row label="Vigencia">
              {DATE.format(contract.startDate)} → {DATE.format(contract.endDate)}
            </Row>
            <Row label="Renta mensual">{MXN.format(Number(contract.monthlyAmount))}</Row>
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
                  ? `· hasta ${DATE.format(contract.advancePaidUntil)}`
                  : ""}
              </Row>
            ) : null}
          </Card>
          <Card title="Acciones">
            <ContractActions
              contractId={contract.id}
              status={contract.status}
              endDate={contract.endDate}
              monthlyAmount={String(contract.monthlyAmount)}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Estado actual:{" "}
              <Badge variant={contractStatusVariant(contract.status)}>
                {contractStatusLabel(contract.status)}
              </Badge>
            </p>
          </Card>
        </div>
        {contract.notes ? (
          <Card title="Notas">
            <p className="whitespace-pre-wrap text-sm">{contract.notes}</p>
          </Card>
        ) : null}
      </TabsContent>

      <TabsContent value="rents" className="mt-4 space-y-4">
        <RentCalendar rents={contract.rents} />
        {contract.rents.length > 0 ? (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Cargo</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pagos registrados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.rents.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.period.toISOString().slice(0, 7)}
                    </TableCell>
                    <TableCell className="text-xs">{DATE.format(r.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {MXN.format(Number(r.amountDue))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {MXN.format(Number(r.amountPaid))}
                    </TableCell>
                    <TableCell>
                      <Badge>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.payments.length === 0
                        ? "—"
                        : r.payments
                            .map(
                              (p) =>
                                `${MXN.format(Number(p.amount))} (${DATE.format(p.paymentDate)})`,
                            )
                            .join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="documents" className="mt-4">
        <ContractDocumentManager
          contractId={contract.id}
          documents={contract.documents}
          canEdit={canEditDocuments}
        />
      </TabsContent>

      <TabsContent value="guarantee" className="mt-4">
        <div className="rounded-md border bg-card p-6">
          {contract.guarantees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se ha registrado depósito en garantía para este contrato.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {contract.guarantees.map((g) => (
                <li key={g.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{MXN.format(Number(g.amount))}</span>
                    <Badge>{guaranteeStatusLabel(g.status)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recibido: {DATE.format(g.receivedDate)}
                    {g.returnedDate ? ` · Devuelto: ${DATE.format(g.returnedDate)}` : ""}
                  </p>
                  {g.notes ? <p className="mt-1 text-xs">{g.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabsContent>

      <TabsContent value="audit" className="mt-4">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Sin movimientos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                auditLog.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs tabular-nums">
                      {DATETIME.format(a.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.user?.name ?? a.user?.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{auditActionLabel(a.action)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">
                      {a.changes ? JSON.stringify(a.changes) : "—"}
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
    <div className="space-y-2 rounded-md border bg-card p-4">
      <h3 className="text-xs font-medium uppercase text-muted-foreground">{title}</h3>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
