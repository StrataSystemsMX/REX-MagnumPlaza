"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  actionCreatePayroll,
  actionUpdatePayroll,
} from "@/server/services/payroll";
import { PayrollType } from "@/generated/prisma/enums";
import type { PayrollListItem } from "@/server/services/payroll-queries";
import type { LegalEntityOption } from "@/server/services/properties-queries";
import { payrollTypeLabel } from "@/shared/i18n/enums";

const NOW_YEAR = new Date().getUTCFullYear();

const MONTHS = [
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
] as const;

const ALL_TYPE_VALUES: ReadonlyArray<PayrollType> = [
  "DIRECT_PAYROLL",
  "ADMIN_SERVICE_INVOICE",
  "STRATEGY_NOMINA",
  "COMMISSION",
  "BONUS",
];

interface Props {
  mode: "create" | "edit" | null;
  initial: PayrollListItem | null;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  defaultYear: number;
  defaultMonth: number;
  prefillEntityId: string | null;
  onClose: () => void;
  /** Restringe los tipos seleccionables (ej. /nominas excluye STRATEGY_NOMINA). */
  allowedTypes?: ReadonlyArray<PayrollType>;
}

export function PayrollFormDialog({
  mode,
  initial,
  legalEntities,
  defaultYear,
  defaultMonth,
  prefillEntityId,
  onClose,
  allowedTypes,
}: Props) {
  const TYPE_VALUES = allowedTypes && allowedTypes.length > 0 ? allowedTypes : ALL_TYPE_VALUES;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const open = mode !== null;

  const entityItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        legalEntities.map((e) => [e.id, `${e.code} — ${e.legalName}`]),
      ),
    [legalEntities],
  );

  const typeItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(TYPE_VALUES.map((t) => [t, payrollTypeLabel(t)])),
    [TYPE_VALUES],
  );

  const monthItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(MONTHS.map((m) => [m.value, m.label])),
    [],
  );

  const [legalEntityId, setLegalEntityId] = useState<string>("");
  const [year, setYear] = useState<string>(String(defaultYear));
  const [month, setMonth] = useState<string>(String(defaultMonth));
  const [type, setType] = useState<PayrollType>(TYPE_VALUES[0] ?? "DIRECT_PAYROLL");
  const [amount, setAmount] = useState<string>("");
  const [amountWithoutTax, setAmountWithoutTax] = useState<string>("");
  const [taxAmount, setTaxAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setLegalEntityId(initial.legalEntity.id);
      setYear(String(initial.year));
      setMonth(String(initial.month));
      setType(initial.type);
      setAmount(initial.amount.toFixed(2));
      setAmountWithoutTax(
        initial.amountWithoutTax !== null
          ? initial.amountWithoutTax.toFixed(2)
          : "",
      );
      setTaxAmount(
        initial.taxAmount !== null ? initial.taxAmount.toFixed(2) : "",
      );
      setDescription(initial.description ?? "");
      setNotes(initial.notes ?? "");
    } else {
      setLegalEntityId(prefillEntityId ?? "");
      setYear(String(defaultYear));
      setMonth(String(defaultMonth));
      setType("DIRECT_PAYROLL");
      setAmount("");
      setAmountWithoutTax("");
      setTaxAmount("");
      setDescription("");
      setNotes("");
    }
  }, [open, mode, initial, prefillEntityId, defaultYear, defaultMonth]);

  // Auto-cálculo de IVA al 16% cuando el usuario captura "sin IVA".
  function recalcFromBase(baseStr: string) {
    setAmountWithoutTax(baseStr);
    const base = Number(baseStr);
    if (!Number.isFinite(base) || base <= 0) return;
    const tax = base * 0.16;
    const total = base + tax;
    setTaxAmount(tax.toFixed(2));
    setAmount(total.toFixed(2));
  }

  function onSubmit() {
    if (!legalEntityId) {
      toast.error("Selecciona la razón social.");
      return;
    }
    const yearNum = Number.parseInt(year, 10);
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > NOW_YEAR + 5) {
      toast.error("Año inválido.");
      return;
    }
    const monthNum = Number.parseInt(month, 10);
    if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
      toast.error("Mes inválido.");
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error("Monto inválido.");
      return;
    }
    const amountWithoutTaxNum =
      amountWithoutTax.trim().length > 0 ? Number(amountWithoutTax) : undefined;
    if (
      amountWithoutTaxNum !== undefined &&
      (!Number.isFinite(amountWithoutTaxNum) || amountWithoutTaxNum < 0)
    ) {
      toast.error("Monto sin IVA inválido.");
      return;
    }
    const taxAmountNum =
      taxAmount.trim().length > 0 ? Number(taxAmount) : undefined;
    if (
      taxAmountNum !== undefined &&
      (!Number.isFinite(taxAmountNum) || taxAmountNum < 0)
    ) {
      toast.error("IVA inválido.");
      return;
    }

    const payload = {
      legalEntityId,
      year: yearNum,
      month: monthNum,
      type,
      amount: amountNum,
      amountWithoutTax: amountWithoutTaxNum,
      taxAmount: taxAmountNum,
      description: description.trim() || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      try {
        if (mode === "edit" && initial) {
          await actionUpdatePayroll({ id: initial.id, ...payload });
          toast.success("Pago actualizado.");
        } else {
          await actionCreatePayroll(payload);
          toast.success("Pago registrado.");
        }
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar pago de nómina" : "Nuevo pago de nómina"}
          </DialogTitle>
          <DialogDescription>
            Registra el pago mensual de nómina, factura de servicios
            administrativos, comisión o bono.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Razón social</Label>
            <Select
              value={legalEntityId}
              onValueChange={(v) => v && setLegalEntityId(v)}
              items={entityItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona la razón social" />
              </SelectTrigger>
              <SelectContent>
                {legalEntities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code} — {e.legalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Año</Label>
              <Input
                type="number"
                min="2000"
                max={String(NOW_YEAR + 5)}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Mes</Label>
              <Select
                value={month}
                onValueChange={(v) => v && setMonth(v)}
                items={monthItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tipo de pago</Label>
            <Select
              value={type}
              onValueChange={(v) => v && setType(v as PayrollType)}
              items={typeItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {payrollTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Monto sin IVA</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amountWithoutTax}
                onChange={(e) => recalcFromBase(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground">
                Auto-calcula IVA 16%
              </p>
            </div>
            <div className="space-y-1">
              <Label>IVA</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-semibold">Monto total</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Concepto / Descripción</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Ej. "Factura Audazon", "Nómina Eli + Leo", etc.'
              maxLength={120}
            />
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "edit" ? "Guardar cambios" : "Registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
