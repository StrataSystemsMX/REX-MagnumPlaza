"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { actionCreateLoan } from "@/server/services/prestamos-actions";
import type { LoanStatus } from "@/generated/prisma/enums";
import type { LegalEntityOption } from "@/server/services/properties-queries";

const LOAN_STATUSES: { value: LoanStatus; label: string }[] = [
  { value: "ACTIVE", label: "Activo" },
  { value: "PAID_OFF", label: "Liquidado" },
  { value: "CANCELLED", label: "Cancelado" },
];

const LOAN_STATUS_ITEMS: Record<string, string> = Object.fromEntries(
  LOAN_STATUSES.map((s) => [s.value, s.label]),
);

interface Props {
  legalEntities: ReadonlyArray<LegalEntityOption>;
}

export function NewLoanDialog({ legalEntities }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const entityItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(legalEntities.map((e) => [e.id, `${e.code} — ${e.legalName}`])),
    [legalEntities],
  );

  const [name, setName] = useState("");
  const [legalEntityId, setLegalEntityId] = useState("");
  const [lender, setLender] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<LoanStatus>("ACTIVE");
  const [notes, setNotes] = useState("");

  function reset() {
    setName(""); setLegalEntityId(""); setLender("");
    setAmount(""); setDate(""); setStatus("ACTIVE"); setNotes("");
  }

  function onSubmit() {
    const amt = Number(amount);
    if (!name.trim()) { toast.error("La descripción es requerida."); return; }
    if (!legalEntityId) { toast.error("Selecciona la razón social."); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Monto inválido."); return; }
    if (!date) { toast.error("La fecha es requerida."); return; }

    startTransition(async () => {
      try {
        await actionCreateLoan({
          name: name.trim(),
          legalEntityId,
          lender: lender.trim() || null,
          amount: amt,
          date,
          status,
          notes: notes.trim() || null,
        });
        toast.success("Préstamo registrado.");
        setOpen(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) reset(); } }}>
      <DialogTrigger render={<Button size="sm"><Plus className="size-4" />Nuevo préstamo</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar préstamo</DialogTitle>
          <DialogDescription>
            Registra un préstamo o crédito recibido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Descripción *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej. "Préstamo JCL enero 2026"'
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Razón social *</Label>
              <Select value={legalEntityId} onValueChange={(v) => v && setLegalEntityId(v)} items={entityItems}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {legalEntities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.code} — {e.legalName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as LoanStatus)} items={LOAN_STATUS_ITEMS}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOAN_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Monto *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Prestamista <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input
              value={lender}
              onChange={(e) => setLender(e.target.value)}
              placeholder="Ej. JCL, BBVA, etc."
              maxLength={120}
            />
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={400} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={pending}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
