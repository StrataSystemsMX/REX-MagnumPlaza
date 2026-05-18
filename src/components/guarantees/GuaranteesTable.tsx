"use client";

import Link from "next/link";
import { GuaranteeStatusBadge } from "./GuaranteeStatusBadge";
import { ReturnGuaranteeDialog } from "./ReturnGuaranteeDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GuaranteeRow } from "@/lib/services/guarantees-queries";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface Props {
  guarantees: GuaranteeRow[];
  canManage: boolean;
}

export function GuaranteesTable({ guarantees, canManage }: Props) {
  if (guarantees.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-muted-foreground">No hay fianzas registradas.</p>
          {canManage && (
            <p className="text-sm text-muted-foreground">
              Usa el botón "Registrar fianza" para agregar la primera.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Todas las fianzas</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inquilino</TableHead>
                <TableHead>Local / Inmueble</TableHead>
                <TableHead className="text-right">Depósito</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Recibido</TableHead>
                <TableHead className="text-right">Devuelto</TableHead>
                <TableHead>Contrato</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {guarantees.map((g) => {
                const isOpen = g.status === "HELD" || g.status === "PARTIALLY_RETURNED";
                const totalDeducted =
                  g.deductions?.reduce((acc, d) => acc + d.amount, 0) ?? 0;

                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/lessees/${g.contract.lessee.id}`}
                        className="hover:underline"
                      >
                        {g.contract.lessee.legalName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {g.contract.unit.property.name}
                      <span className="ml-1 font-medium text-foreground">
                        {g.contract.unit.code}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {MXN.format(g.amount)}
                    </TableCell>
                    <TableCell>
                      <GuaranteeStatusBadge status={g.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      {DATE.format(g.receivedDate)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {g.returnedAmount !== null ? (
                        <span className="text-emerald-700">{MXN.format(g.returnedAmount)}</span>
                      ) : totalDeducted > 0 ? (
                        <span className="text-destructive">-{MXN.format(totalDeducted)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/contracts/${g.contractId}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Ver contrato
                      </Link>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {isOpen && (
                          <ReturnGuaranteeDialog
                            guaranteeId={g.id}
                            totalAmount={g.amount}
                            lesseeName={g.contract.lessee.legalName}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
