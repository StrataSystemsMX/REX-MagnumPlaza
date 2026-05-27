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
  contractStatusLabel,
  contractTypeLabel,
  guaranteeStatusLabel,
} from "@/lib/i18n/enums";
import { isPlaza, unitCode } from "@/lib/i18n/unit-label";
import type {
  ContractAuditEntry,
  ContractDetail,
} from "@/lib/services/contracts-queries";
import type { ContractStatus, ContractType } from "@/generated/prisma/enums";
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

// =============================================================================
// Auditoría: convierte el metadata crudo (JSON) en una frase legible.
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmtDate(v: unknown): string {
  if (typeof v !== "string") return String(v ?? "—");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : capitalizeFirst(DATE.format(d));
}

function fmtMoney(v: unknown): string {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isNaN(n) ? String(v) : MXN.format(n);
}

function statusLabelSafe(s: string): string {
  try {
    return contractStatusLabel(s as ContractStatus);
  } catch {
    return s;
  }
}

const FIELD_LABELS: Record<string, string> = {
  monthlyAmount: "Renta mensual",
  guaranteeAmount: "Fianza",
  startDate: "Inicio",
  endDate: "Fin",
  paymentDay: "Día de pago",
  lateFeePercentage: "Interés moratorio",
  type: "Tipo de contrato",
  autoRenew: "Auto-renovación",
  paidInAdvance: "Pago adelantado",
  advancePaidUntil: "Pagado hasta",
};

/** Describe un campo individual del bloque `after`. Devuelve null para ocultarlo. */
function describeField(key: string, value: unknown): string | null {
  switch (key) {
    case "unitId":
    case "lesseeId":
      return null; // IDs internos: no aportan nada al usuario.
    case "monthlyAmount":
    case "guaranteeAmount":
      return `${FIELD_LABELS[key]}: ${fmtMoney(value)}`;
    case "startDate":
    case "endDate":
    case "advancePaidUntil":
      return `${FIELD_LABELS[key]}: ${fmtDate(value)}`;
    case "paymentDay":
      return `${FIELD_LABELS[key]}: ${String(value)}`;
    case "lateFeePercentage":
      return `${FIELD_LABELS[key]}: ${String(value)}%`;
    case "type":
      return `${FIELD_LABELS[key]}: ${contractTypeLabel(value as ContractType)}`;
    case "autoRenew":
    case "paidInAdvance":
      return `${FIELD_LABELS[key]}: ${value ? "Sí" : "No"}`;
    case "notes":
      return value ? "Notas actualizadas" : null;
    default:
      return null;
  }
}

/** Traduce el metadata de un movimiento de auditoría a una frase en español. */
function describeAuditDetail(entry: ContractAuditEntry): string {
  const c = entry.changes;
  if (!isRecord(c)) return "Sin detalles.";

  // Cambio de estado (activar, terminar, cancelar, renovar...).
  if (isRecord(c.transition)) {
    const to = String(c.transition.to ?? "");
    if (to === "ACTIVE") {
      const n = typeof c.rentsCreated === "number" ? c.rentsCreated : null;
      return n !== null
        ? `Activó el contrato y generó ${n} ${n === 1 ? "cargo mensual" : "cargos mensuales"} de renta.`
        : "Activó el contrato.";
    }
    if (to === "TERMINATED") {
      const date = c.terminationDate ? ` el ${fmtDate(c.terminationDate)}` : "";
      const reason =
        typeof c.reason === "string" && c.reason ? ` — motivo: ${c.reason}` : "";
      return `Terminó el contrato anticipadamente${date}${reason}.`;
    }
    if (to === "CANCELLED") return "Canceló el contrato.";
    const from = String(c.transition.from ?? "");
    return `Cambió el estado de ${statusLabelSafe(from)} a ${statusLabelSafe(to)}.`;
  }

  // Renovación: se crea un contrato nuevo a partir de otro.
  if (typeof c.renewedFrom === "string") {
    const parts: string[] = [];
    if (c.newEndDate) parts.push(`nueva vigencia hasta ${fmtDate(c.newEndDate)}`);
    if (c.newAmount != null) parts.push(`renta ${fmtMoney(c.newAmount)}`);
    return `Renovó el contrato${parts.length ? ` — ${parts.join(", ")}` : ""}.`;
  }

  // Alta o edición: resumimos los campos del bloque `after`.
  if (isRecord(c.after)) {
    const parts = Object.entries(c.after)
      .map(([k, v]) => describeField(k, v))
      .filter((s): s is string => s !== null);
    if (entry.action === "CREATE") {
      return parts.length
        ? `Creó el contrato — ${parts.join(" · ")}.`
        : "Creó el contrato.";
    }
    return parts.length ? `Actualizó: ${parts.join(" · ")}.` : "Actualizó el contrato.";
  }

  return "Sin detalles.";
}

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
                      {describeAuditDetail(a)}
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
