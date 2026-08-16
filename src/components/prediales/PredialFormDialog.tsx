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
  actionCreateCadastralPayment,
  actionUpdateCadastralPayment,
} from "@/server/services/cadastral";
import type {
  CadastralListItem,
  CadastralPropertyOption,
} from "@/server/services/cadastral-queries";
import type { LegalEntityOption } from "@/server/services/properties-queries";

const NOW_YEAR = new Date().getUTCFullYear();
const PAYER_NONE = "__NONE__";

type PayerKind = "OWNER" | "ENTITY" | "THIRD_PARTY";

interface Props {
  mode: "create" | "edit" | null;
  initial: CadastralListItem | null;
  properties: ReadonlyArray<CadastralPropertyOption>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  defaultYear: number;
  onClose: () => void;
}

function toIsoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function PredialFormDialog({
  mode,
  initial,
  properties,
  legalEntities,
  defaultYear,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const open = mode !== null;

  const propertyItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        properties.map((p) => [
          p.id,
          p.cadastralKey ? `${p.name} · ${p.cadastralKey}` : p.name,
        ]),
      ),
    [properties],
  );

  const payerKindItems: Record<PayerKind, string> = {
    OWNER: "Misma razón social dueña",
    ENTITY: "Otra razón social del tenant",
    THIRD_PARTY: "Tercero externo",
  };

  const payerEntityItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(legalEntities.map((e) => [e.id, `${e.code} — ${e.legalName}`])),
    [legalEntities],
  );

  const [propertyId, setPropertyId] = useState<string>("");
  const [year, setYear] = useState<string>(String(defaultYear));
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(`${defaultYear}-03-31`);
  const [payerKind, setPayerKind] = useState<PayerKind>("OWNER");
  const [payerEntityId, setPayerEntityId] = useState<string>("");
  const [paidByThirdPartyName, setPaidByThirdPartyName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setPropertyId(initial.propertyId);
      setYear(String(initial.year));
      setTotalAmount(
        initial.totalAmount !== null ? initial.totalAmount.toFixed(2) : "",
      );
      setDueDate(toIsoDate(initial.dueDate));
      if (initial.paidByThirdPartyName) {
        setPayerKind("THIRD_PARTY");
        setPayerEntityId("");
        setPaidByThirdPartyName(initial.paidByThirdPartyName);
      } else if (initial.payerEntity) {
        setPayerKind("ENTITY");
        setPayerEntityId(initial.payerEntity.id);
        setPaidByThirdPartyName("");
      } else {
        setPayerKind("OWNER");
        setPayerEntityId("");
        setPaidByThirdPartyName("");
      }
      setNotes(initial.notes ?? "");
    } else {
      setPropertyId("");
      setYear(String(defaultYear));
      setTotalAmount("");
      setDueDate(`${defaultYear}-03-31`);
      setPayerKind("OWNER");
      setPayerEntityId("");
      setPaidByThirdPartyName("");
      setNotes("");
    }
  }, [open, mode, initial, defaultYear]);

  function onSubmit() {
    if (!propertyId) {
      toast.error("Selecciona el inmueble.");
      return;
    }
    const yearNum = Number.parseInt(year, 10);
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > NOW_YEAR + 5) {
      toast.error("Año inválido.");
      return;
    }
    const amountNum =
      totalAmount.trim().length > 0 ? Number(totalAmount) : undefined;
    if (amountNum !== undefined && (!Number.isFinite(amountNum) || amountNum < 0)) {
      toast.error("Monto inválido.");
      return;
    }

    const basePayload = {
      propertyId,
      year: yearNum,
      totalAmount: amountNum,
      dueDate: new Date(dueDate),
      payerEntityId: payerKind === "ENTITY" ? payerEntityId || null : null,
      paidByThirdPartyName:
        payerKind === "THIRD_PARTY"
          ? paidByThirdPartyName.trim() || null
          : null,
      notes: notes.trim() || null,
    };

    if (payerKind === "ENTITY" && !payerEntityId) {
      toast.error("Selecciona la razón social que paga.");
      return;
    }
    if (payerKind === "THIRD_PARTY" && !paidByThirdPartyName.trim()) {
      toast.error("Indica quién es el tercero que paga.");
      return;
    }

    startTransition(async () => {
      try {
        if (mode === "edit" && initial) {
          await actionUpdateCadastralPayment({ id: initial.id, ...basePayload });
          toast.success("Predial actualizado.");
        } else {
          await actionCreateCadastralPayment(basePayload);
          toast.success("Predial creado.");
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
            {mode === "edit" ? "Editar predial" : "Nuevo predial"}
          </DialogTitle>
          <DialogDescription>
            Pago anual del impuesto predial por inmueble. Si la razón social
            que paga difiere de la dueña, indícalo abajo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Inmueble</Label>
            <Select
              value={propertyId}
              onValueChange={(v) => v && setPropertyId(v)}
              disabled={mode === "edit"}
              items={propertyItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un inmueble" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.cadastralKey ? `· ${p.cadastralKey}` : ""}
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
                disabled={mode === "edit"}
              />
            </div>
            <div className="space-y-1">
              <Label>Monto (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Vence</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Quién paga</Label>
            <Select
              value={payerKind}
              onValueChange={(v) => {
                if (!v) return;
                setPayerKind(v as PayerKind);
                if (v !== "ENTITY") setPayerEntityId("");
                if (v !== "THIRD_PARTY") setPaidByThirdPartyName("");
              }}
              items={payerKindItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OWNER">{payerKindItems.OWNER}</SelectItem>
                <SelectItem value="ENTITY">{payerKindItems.ENTITY}</SelectItem>
                <SelectItem value="THIRD_PARTY">{payerKindItems.THIRD_PARTY}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {payerKind === "ENTITY" ? (
            <div className="space-y-1">
              <Label>Razón social pagadora</Label>
              <Select
                value={payerEntityId || PAYER_NONE}
                onValueChange={(v) => {
                  if (!v) return;
                  setPayerEntityId(v === PAYER_NONE ? "" : v);
                }}
                items={payerEntityItems}
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
          ) : null}

          {payerKind === "THIRD_PARTY" ? (
            <div className="space-y-1">
              <Label>Nombre del tercero</Label>
              <Input
                value={paidByThirdPartyName}
                onChange={(e) => setPaidByThirdPartyName(e.target.value)}
                placeholder='Ej. "JC"'
                maxLength={80}
              />
            </div>
          ) : null}

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
            {mode === "edit" ? "Guardar cambios" : "Crear predial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
