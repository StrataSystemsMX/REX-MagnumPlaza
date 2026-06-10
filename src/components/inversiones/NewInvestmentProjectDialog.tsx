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
import { actionCreateInvestmentProject } from "@/lib/services/inversiones-actions";
import type { InvestmentProjectStatus } from "@/generated/prisma/enums";
import type { LegalEntityOption } from "@/lib/services/properties-queries";

const STATUS_OPTIONS: { value: InvestmentProjectStatus; label: string }[] = [
  { value: "PLANNING", label: "Planeación" },
  { value: "ACTIVE", label: "Activo" },
  { value: "PAUSED", label: "Pausado" },
  { value: "COMPLETED", label: "Completado" },
];

const STATUS_ITEMS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

interface PropertyOption {
  id: string;
  name: string;
}

interface Props {
  legalEntities: ReadonlyArray<LegalEntityOption>;
  properties: ReadonlyArray<PropertyOption>;
}

export function NewInvestmentProjectDialog({ legalEntities, properties }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const entityItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(legalEntities.map((e) => [e.id, `${e.code} — ${e.legalName}`])),
    [legalEntities],
  );
  const propertyItems = useMemo<Record<string, string>>(
    () => ({ "_none": "Sin inmueble específico", ...Object.fromEntries(properties.map((p) => [p.id, p.name])) }),
    [properties],
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [legalEntityId, setLegalEntityId] = useState("");
  const [propertyId, setPropertyId] = useState("_none");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<InvestmentProjectStatus>("ACTIVE");
  const [notes, setNotes] = useState("");

  function reset() {
    setName(""); setDescription(""); setLegalEntityId("");
    setPropertyId("_none"); setBudgetAmount(""); setStartDate("");
    setEndDate(""); setStatus("ACTIVE"); setNotes("");
  }

  function onSubmit() {
    const budget = Number(budgetAmount);
    if (!name.trim()) { toast.error("El nombre es requerido."); return; }
    if (!legalEntityId) { toast.error("Selecciona la razón social."); return; }
    if (!Number.isFinite(budget) || budget < 0) { toast.error("Presupuesto inválido."); return; }
    if (!startDate) { toast.error("La fecha de inicio es requerida."); return; }

    startTransition(async () => {
      try {
        await actionCreateInvestmentProject({
          name: name.trim(),
          description: description.trim() || null,
          legalEntityId,
          propertyId: propertyId === "_none" ? null : propertyId,
          budgetAmount: budget,
          startDate,
          endDate: endDate || null,
          status,
          notes: notes.trim() || null,
        });
        toast.success("Proyecto registrado.");
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
      <DialogTrigger render={<Button size="sm"><Plus className="size-4" />Nuevo proyecto</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto de inversión</DialogTitle>
          <DialogDescription>
            Registra un proyecto de obra, remodelación o inversión con su presupuesto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre del proyecto *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej. "Remodelación Plaza Quiroga"'
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
                    <SelectItem key={e.id} value={e.id}>
                      {e.code} — {e.legalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as InvestmentProjectStatus)} items={STATUS_ITEMS}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Inmueble asociado <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Select value={propertyId} onValueChange={(v) => v && setPropertyId(v)} items={propertyItems}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin inmueble específico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin inmueble específico</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Presupuesto *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Inicio *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fin estimado <span className="text-muted-foreground text-xs">(opc.)</span></Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descripción</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Alcance, contratistas, etc."
              maxLength={500}
            />
          </div>

          <div className="space-y-1">
            <Label>Notas internas</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones adicionales"
              maxLength={300}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Registrar proyecto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
