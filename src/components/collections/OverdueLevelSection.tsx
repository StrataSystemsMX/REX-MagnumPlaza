"use client";

import { FileDown } from "lucide-react";
import Link from "next/link";
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
import { SendWhatsAppButton } from "@/components/collections/SendWhatsAppButton";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import type { OutstandingRent } from "@/lib/services/payments-queries";
import type { ReminderLevel } from "@/lib/pdf/template-config";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

interface OverdueLevelSectionProps {
  level: 1 | 2 | 3;
  rents: ReadonlyArray<OutstandingRent>;
  /** Mapa rentId → último contacto registrado en NotificationLog. */
  lastContactByRent: Record<string, { sentAt: Date; channel: string }>;
}

export function OverdueLevelSection({
  level,
  rents,
  lastContactByRent,
}: OverdueLevelSectionProps) {
  function generateNotice(rentId: string) {
    const levelStr = level === 1 ? "1M" : level === 2 ? "2M" : "3M";
    const url = `/api/documents/overdue-reminder?rentId=${encodeURIComponent(rentId)}&level=${levelStr}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const totalBalance = rents.reduce((acc, r) => acc + Number(r.balance), 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {level === 1
                ? "1 mes vencido — Aviso amistoso"
                : level === 2
                  ? "2 meses vencidos — Aviso formal"
                  : "3 meses vencidos — Inicio de desalojo"}
            </h2>
            <Badge variant={level === 3 ? "destructive" : "secondary"}>
              {rents.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Saldo total en este nivel:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {MXN.format(totalBalance)}
            </span>
          </p>
        </div>
      </div>

      {level === 3 && rents.length > 0 ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-semibold text-destructive">
            Casos para revisar con abogado.
          </p>
          <p className="text-xs text-destructive/80">
            Política CRT: a partir de 90 días vencidos se inicia el procedimiento
            formal de desalojo. Confirmar con dirección antes de mandar la carta.
          </p>
        </div>
      ) : null}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inquilino</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Periodo</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Días vencido</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último contacto</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rents.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-sm text-muted-foreground"
                >
                  Sin casos en este nivel.
                </TableCell>
              </TableRow>
            ) : (
              rents.map((r) => {
                const lc = lastContactByRent[r.id];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      <Link
                        href={`/lessees/${r.contract.lessee.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.contract.lessee.legalName}
                      </Link>
                      {r.contract.lessee.contactName ? (
                        <p className="text-xs text-muted-foreground">
                          {r.contract.lessee.contactName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.contract.unit.property.name} {r.contract.unit.code}
                    </TableCell>
                    <TableCell className="text-sm">
                      {capitalizeFirst(PERIOD.format(r.period))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {MXN.format(Number(r.balance))}
                    </TableCell>
                    <TableCell className="text-xs">{r.daysOverdue}d</TableCell>
                    <TableCell>
                      <RentStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {lc ? (
                        <>
                          {capitalizeFirst(DATE.format(lc.sentAt))}
                          <p className="text-muted-foreground">{lc.channel}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => generateNotice(r.id)}
                          title="Ver PDF del aviso"
                        >
                          <FileDown className="size-4" />
                          PDF
                        </Button>
                        <SendWhatsAppButton
                          rentId={r.id}
                          level={
                            (level === 1 ? "1M" : level === 2 ? "2M" : "3M") as ReminderLevel
                          }
                          lesseeName={r.contract.lessee.legalName}
                          hasWhatsapp={Boolean(r.contract.lessee.whatsapp)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
