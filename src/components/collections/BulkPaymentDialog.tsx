"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EnumSelect } from "@/components/ui/enum-select";
import { Separator } from "@/components/ui/separator";
import { paymentMethodLabel } from "@/lib/i18n/enums";
import {
  actionGetOutstandingRentsForLessee,
  actionRegisterBulkPayment,
} from "@/lib/services/payments";
import { actionSearchLessees, type LesseeSearchResult } from "@/lib/services/lessees";
import { bulkPaymentSchema } from "@/lib/validators/payment";
import type { OutstandingRentLite } from "@/lib/services/payments-queries";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";

const METHODS: ReadonlyArray<PaymentMethod> = [
  "TRANSFER",
  "CASH",
  "CHECK",
  "DEPOSIT",
  "CARD",
  "OTHER",
];

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface BulkPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLessee?: { id: string; legalName: string };
}

export function BulkPaymentDialog({
  open,
  onOpenChange,
  initialLessee,
}: BulkPaymentDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [loadingRents, startLoadRents] = useTransition();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LesseeSearchResult[]>([]);
  const [lesseeId, setLesseeId] = useState<string | null>(initialLessee?.id ?? null);
  const [lesseeLabel, setLesseeLabel] = useState<string>(initialLessee?.legalName ?? "");
  const [rents, setRents] = useState<OutstandingRentLite[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [reference, setReference] = useState("");
  const [autoTotal, setAutoTotal] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setResults([]);
    setRents([]);
    setSelected({});
    setReference("");
    setMethod("TRANSFER");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAutoTotal("");
    if (initialLessee) {
      setLesseeId(initialLessee.id);
      setLesseeLabel(initialLessee.legalName);
    } else {
      setLesseeId(null);
      setLesseeLabel("");
    }
  }, [open, initialLessee]);

  useEffect(() => {
    if (!lesseeId) {
      setRents([]);
      return;
    }
    startLoadRents(async () => {
      try {
        const r = await actionGetOutstandingRentsForLessee(lesseeId);
        setRents(r);
        // Auto-seleccionar todos por default con el saldo de cada uno.
        const initial: Record<string, string> = {};
        for (const rent of r) initial[rent.id] = rent.balance;
        setSelected(initial);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error cargando rentas.");
      }
    });
  }, [lesseeId]);

  function runSearch(query: string) {
    setSearch(query);
    startSearch(async () => {
      try {
        const r = await actionSearchLessees(query, query.trim() ? 10 : 100);
        setResults(r);
      } catch {
        // silent
      }
    });
  }

  function pickLessee(l: LesseeSearchResult) {
    setLesseeId(l.id);
    setLesseeLabel(l.legalName);
    setResults([]);
    setSearch("");
  }

  function toggleRent(rentId: string, balance: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[rentId] !== undefined) {
        delete next[rentId];
      } else {
        next[rentId] = balance;
      }
      return next;
    });
  }

  function setRentAmount(rentId: string, amount: string) {
    setSelected((prev) => ({ ...prev, [rentId]: amount }));
  }

  function distributeOldestFirst() {
    const total = Number(autoTotal);
    if (!Number.isFinite(total) || total <= 0) {
      toast.error("Ingresa un monto válido en 'Monto recibido'.");
      return;
    }
    let remaining = total;
    const next: Record<string, string> = {};
    for (const r of rents) {
      if (remaining <= 0) continue;
      const balance = Number(r.balance);
      const apply = Math.min(remaining, balance);
      if (apply > 0) {
        next[r.id] = apply.toFixed(2);
        remaining -= apply;
      }
    }
    setSelected(next);
    if (remaining > 0.01) {
      toast.info(
        `Sobran ${MXN.format(remaining)} sin aplicar (excedió el saldo total pendiente).`,
      );
    }
  }

  const splitByRent = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v !== "" && Number(v) > 0)
        .map(([rentId, amount]) => ({ rentId, amount: Number(amount) })),
    [selected],
  );

  const total = splitByRent.reduce((acc, s) => acc + s.amount, 0);

  function onSubmit() {
    if (!lesseeId) {
      toast.error("Selecciona un inquilino primero.");
      return;
    }
    const parsed = bulkPaymentSchema.safeParse({
      lesseeId,
      amount: Number(total.toFixed(2)),
      paymentDate,
      method,
      reference: reference || undefined,
      splitByRent,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await actionRegisterBulkPayment(parsed.data);
        toast.success(
          `${MXN.format(parsed.data.amount)} aplicados a ${r.rentsUpdated} renta${r.rentsUpdated === 1 ? "" : "s"}.`,
        );
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar el pago.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago bulk</DialogTitle>
          <DialogDescription>
            Aplica un pago a varias rentas del mismo inquilino (caso típico:
            transferencia que salda 2-3 meses).
          </DialogDescription>
        </DialogHeader>

        {!lesseeId ? (
          <div className="space-y-2">
            <Label>Buscar inquilino</Label>
            <Input
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              onFocus={() => { if (results.length === 0) runSearch(""); }}
              placeholder="Filtrar por nombre o RFC..."
              autoFocus
            />
            <div className="rounded-md border max-h-64 overflow-auto">
              {searching ? (
                <p className="p-3 text-center text-sm text-muted-foreground">Buscando...</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  {search ? "Sin coincidencias." : "Sin inquilinos activos."}
                </p>
              ) : (
                <ul className="divide-y">
                  {results.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/50"
                        onClick={() => pickLessee(l)}
                      >
                        <p className="font-medium">{l.legalName}</p>
                        {l.contactName ? (
                          <p className="text-xs text-muted-foreground">{l.contactName}</p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-secondary/30 p-2 text-sm">
              <span className="text-muted-foreground">Inquilino: </span>
              <span className="font-medium">{lesseeLabel}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={() => setLesseeId(null)}
              >
                cambiar
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Fecha de pago</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Método</Label>
                <EnumSelect
                  values={METHODS}
                  labelFor={paymentMethodLabel}
                  value={method}
                  onValueChange={(v) => setMethod(v)}
                />
              </div>
              <div className="space-y-1">
                <Label>Referencia</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
                <Label>Aplicar a rentas pendientes</Label>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Monto recibido
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="69220"
                      className="w-36 tabular-nums"
                      value={autoTotal}
                      onChange={(e) => setAutoTotal(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={distributeOldestFirst}
                    disabled={!autoTotal || rents.length === 0}
                  >
                    Distribuir
                  </Button>
                </div>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                &ldquo;Distribuir&rdquo; llena las rentas más antiguas primero hasta cubrir el monto recibido.
              </p>
              <div className="rounded-md border max-h-72 overflow-auto">
                {loadingRents ? (
                  <p className="p-3 text-center text-sm text-muted-foreground">
                    Cargando rentas pendientes...
                  </p>
                ) : rents.length === 0 ? (
                  <p className="p-3 text-center text-sm text-muted-foreground">
                    Este inquilino no tiene rentas pendientes.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {rents.map((r) => {
                      const isSelected = selected[r.id] !== undefined;
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-3 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRent(r.id, r.balance)}
                          />
                          <div className="flex-1">
                            <p className="font-medium">
                              {capitalizeFirst(PERIOD.format(r.period))} · {r.unitLabel}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Cargo {MXN.format(Number(r.amountDue))} · Pagado{" "}
                              {MXN.format(Number(r.amountPaid))} · Saldo{" "}
                              <span className="font-medium">
                                {MXN.format(Number(r.balance))}
                              </span>
                            </p>
                          </div>
                          {isSelected ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-32 tabular-nums"
                              value={selected[r.id] ?? ""}
                              onChange={(e) => setRentAmount(r.id, e.target.value)}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-card p-3 text-sm">
              <Row label={`Total a aplicar (${splitByRent.length} renta${splitByRent.length === 1 ? "" : "s"})`}>
                <span className="text-base font-semibold">{MXN.format(total)}</span>
              </Row>
            </div>
          </div>
        )}

        <Separator />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending || !lesseeId || splitByRent.length === 0}>
            {pending
              ? "Registrando..."
              : `Aplicar ${MXN.format(total)} a ${splitByRent.length} renta${splitByRent.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
