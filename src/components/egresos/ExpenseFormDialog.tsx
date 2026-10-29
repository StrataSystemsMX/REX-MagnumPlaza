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
import { PaymentMethod } from "@/generated/prisma/enums";
import {
  actionCreateExpense,
  actionUpdateExpense,
} from "@/server/services/expenses";
import type {
  ExpenseCategoryOption,
  ExpenseListItem,
  ExpensePropertyOption,
} from "@/server/services/expenses-queries";
import type { LegalEntityOption } from "@/server/services/properties-queries";

const PROPERTY_NONE = "__NONE__";
const PAYMENT_METHOD_NONE = "__NONE__";

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  DEPOSIT: "Depósito",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

interface Props {
  mode: "create" | "edit" | null;
  initial: ExpenseListItem | null;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  categories: ReadonlyArray<ExpenseCategoryOption>;
  properties: ReadonlyArray<ExpensePropertyOption>;
  defaultLegalEntityId?: string | null;
  onClose: () => void;
}

function toIsoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormDialog({
  mode,
  initial,
  legalEntities,
  categories,
  properties,
  defaultLegalEntityId,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const open = mode !== null;

  const legalEntityItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        legalEntities.map((e) => [e.id, `${e.code} — ${e.legalName}`]),
      ),
    [legalEntities],
  );

  const categoryItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const propertyItems = useMemo<Record<string, string>>(
    () => ({
      [PROPERTY_NONE]: "— Sin inmueble específico —",
      ...Object.fromEntries(properties.map((p) => [p.id, p.name])),
    }),
    [properties],
  );

  const paymentMethodItems = useMemo<Record<string, string>>(
    () => ({
      [PAYMENT_METHOD_NONE]: "— No especificar —",
      ...PAYMENT_METHOD_LABEL,
    }),
    [],
  );

  const [legalEntityId, setLegalEntityId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState<string>(todayIso());
  const [description, setDescription] = useState<string>("");
  const [vendor, setVendor] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [isPaid, setIsPaid] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setLegalEntityId(initial.legalEntity.id);
      setCategoryId(initial.category.id);
      setPropertyId(initial.property?.id ?? "");
      setAmount(initial.amount.toFixed(2));
      setExpenseDate(toIsoDate(initial.expenseDate));
      setDescription(initial.description);
      setVendor(initial.vendor ?? "");
      setInvoiceNumber(initial.invoiceNumber ?? "");
      setPaymentMethod(initial.paymentMethod ?? "");
      setIsPaid(initial.isPaid);
      setNotes(initial.notes ?? "");
    } else {
      setLegalEntityId(defaultLegalEntityId ?? "");
      setCategoryId("");
      setPropertyId("");
      setAmount("");
      setExpenseDate(todayIso());
      setDescription("");
      setVendor("");
      setInvoiceNumber("");
      setPaymentMethod("");
      setIsPaid(true);
      setNotes("");
    }
  }, [open, mode, initial, defaultLegalEntityId]);

  function onSubmit() {
    if (!legalEntityId) {
      toast.error("Selecciona la razón social.");
      return;
    }
    if (!categoryId) {
      toast.error("Selecciona la categoría.");
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Monto inválido.");
      return;
    }
    if (!description.trim()) {
      toast.error("Describe el egreso.");
      return;
    }

    const payload = {
      legalEntityId,
      categoryId,
      propertyId: propertyId || null,
      amount: amountNum,
      expenseDate: new Date(expenseDate),
      description: description.trim(),
      vendor: vendor.trim() || null,
      invoiceNumber: invoiceNumber.trim() || null,
      paymentMethod: paymentMethod
        ? (paymentMethod as PaymentMethod)
        : null,
      isPaid,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      try {
        if (mode === "edit" && initial) {
          await actionUpdateExpense({ id: initial.id, ...payload });
          toast.success("Egreso actualizado.");
        } else {
          await actionCreateExpense(payload);
          toast.success("Egreso creado.");
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
            {mode === "edit" ? "Editar egreso" : "Nuevo egreso"}
          </DialogTitle>
          <DialogDescription>
            Registra el gasto y a qué razón social y categoría pertenece.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Razón social</Label>
              <Select
                value={legalEntityId}
                onValueChange={(v) => v && setLegalEntityId(v)}
                items={legalEntityItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona" />
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
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => v && setCategoryId(v)}
                items={categoryItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Monto (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select
                value={isPaid ? "PAID" : "PENDING"}
                onValueChange={(v) => v && setIsPaid(v === "PAID")}
                items={{ PAID: "Pagado", PENDING: "Pendiente" }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAID">Pagado</SelectItem>
                  <SelectItem value="PENDING">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descripción</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Pago CFE Plaza Progreso enero"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Inmueble (opcional)</Label>
              <Select
                value={propertyId || PROPERTY_NONE}
                onValueChange={(v) => {
                  if (!v) return;
                  setPropertyId(v === PROPERTY_NONE ? "" : v);
                }}
                items={propertyItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PROPERTY_NONE}>
                    — Sin inmueble específico —
                  </SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Forma de pago (opcional)</Label>
              <Select
                value={paymentMethod || PAYMENT_METHOD_NONE}
                onValueChange={(v) => {
                  if (!v) return;
                  setPaymentMethod(v === PAYMENT_METHOD_NONE ? "" : v);
                }}
                items={paymentMethodItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PAYMENT_METHOD_NONE}>
                    — No especificar —
                  </SelectItem>
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {PAYMENT_METHOD_LABEL[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Proveedor (opcional)</Label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <Label>Folio / referencia (opcional)</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                maxLength={80}
              />
            </div>
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
            {mode === "edit" ? "Guardar cambios" : "Crear egreso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
