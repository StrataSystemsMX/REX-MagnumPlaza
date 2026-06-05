"use client";

import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { LesseeForm } from "@/components/forms/LesseeForm";
import { EnumSelect } from "@/components/ui/enum-select";
import { contractTypeLabel, propertyTypeLabel, unitStatusLabel } from "@/lib/i18n/enums";
import { isPlaza, unitCode } from "@/lib/i18n/unit-label";
import { cn } from "@/lib/utils";
import { actionCreateContract } from "@/lib/services/contracts";
import { actionSearchLessees, type LesseeSearchResult } from "@/lib/services/lessees";
import {
  createContractSchema,
  type CreateContractInput,
} from "@/lib/validators/contract";
import type { AvailableUnit } from "@/lib/services/contracts-queries";
import type { ContractType } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";

const CONTRACT_TYPES: ReadonlyArray<ContractType> = [
  "ARRENDAMIENTO",
  "COMODATO",
  "ADMINISTRACION_INTERNA",
  "COMPRAVENTA",
];

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "long",
  day: "2-digit",
  timeZone: "UTC",
});

type Step = 1 | 2 | 3 | 4;

interface ContractWizardProps {
  availableUnits: ReadonlyArray<AvailableUnit>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /**
   * Inquilino pre-seleccionado. Cuando se lanza el wizard desde el detalle de
   * un inquilino ya conocemos quién es, así que arrancamos el paso 2 resuelto.
   */
  initialLessee?: { id: string; legalName: string };
  /**
   * Unidad pre-seleccionada. Cuando se lanza desde "Rentar" en cobranza ya
   * sabemos qué local se va a contratar, así que arrancamos el paso 1 resuelto.
   */
  initialUnitId?: string | null;
}

interface DraftTerms {
  type: ContractType;
  startDate: string;
  endDate: string;
  monthlyAmount: string;
  guaranteeAmount: string;
  paymentDay: string;
  lateFeePercentage: string;
  autoRenew: boolean;
  paidInAdvance: boolean;
  advancePaidUntil: string;
  notes: string;
}

const initialTerms: DraftTerms = {
  type: "ARRENDAMIENTO",
  startDate: "",
  endDate: "",
  monthlyAmount: "",
  guaranteeAmount: "",
  paymentDay: "1",
  lateFeePercentage: "5",
  autoRenew: false,
  paidInAdvance: false,
  advancePaidUntil: "",
  notes: "",
};

export function ContractWizard({
  availableUnits,
  open,
  onOpenChange,
  onCreated,
  initialLessee,
  initialUnitId,
}: ContractWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [unitId, setUnitId] = useState<string | null>(initialUnitId ?? null);
  const [lesseeId, setLesseeId] = useState<string | null>(initialLessee?.id ?? null);
  const [lesseeLabel, setLesseeLabel] = useState<string>(initialLessee?.legalName ?? "");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LesseeSearchResult[]>([]);
  const [terms, setTerms] = useState<DraftTerms>(initialTerms);
  const [createLesseeOpen, setCreateLesseeOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [searching, startSearchTransition] = useTransition();

  const selectedUnit = useMemo(
    () => availableUnits.find((u) => u.id === unitId) ?? null,
    [availableUnits, unitId],
  );

  function reset() {
    setStep(1);
    setUnitId(initialUnitId ?? null);
    setLesseeId(initialLessee?.id ?? null);
    setLesseeLabel(initialLessee?.legalName ?? "");
    setSearch("");
    setResults([]);
    setTerms(initialTerms);
  }

  function close(open: boolean) {
    onOpenChange(open);
    if (!open) reset();
  }

  function runSearch(query: string) {
    setSearch(query);
    startSearchTransition(async () => {
      try {
        const r = await actionSearchLessees(query);
        setResults(r);
      } catch {
        // silencio: el usuario verá una lista vacía
      }
    });
  }

  function pickLessee(l: LesseeSearchResult) {
    setLesseeId(l.id);
    setLesseeLabel(l.legalName);
  }

  function onUnitNext() {
    if (!unitId) {
      toast.error("Selecciona una unidad para continuar.");
      return;
    }
    if (!terms.monthlyAmount && selectedUnit?.estimatedRent) {
      setTerms((t) => ({
        ...t,
        monthlyAmount: String(selectedUnit.estimatedRent),
        guaranteeAmount: String(selectedUnit.estimatedRent),
      }));
    }
    setStep(2);
    runSearch("");
  }

  function onLesseeNext() {
    if (!lesseeId) {
      toast.error("Selecciona o crea un inquilino para continuar.");
      return;
    }
    setStep(3);
  }

  function buildInput(): CreateContractInput | null {
    if (!unitId || !lesseeId) return null;
    const parsed = createContractSchema.safeParse({
      unitId,
      lesseeId,
      type: terms.type,
      startDate: terms.startDate,
      endDate: terms.endDate,
      monthlyAmount: Number(terms.monthlyAmount),
      guaranteeAmount: Number(terms.guaranteeAmount || 0),
      paymentDay: Number(terms.paymentDay),
      lateFeePercentage:
        terms.lateFeePercentage === "" ? undefined : Number(terms.lateFeePercentage),
      autoRenew: terms.autoRenew,
      paidInAdvance: terms.paidInAdvance,
      advancePaidUntil:
        terms.paidInAdvance && terms.advancePaidUntil ? terms.advancePaidUntil : undefined,
      notes: terms.notes || undefined,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Datos inválidos.");
      return null;
    }
    return parsed.data;
  }

  function onTermsNext() {
    const input = buildInput();
    if (!input) return;
    setStep(4);
  }

  function onConfirm() {
    const input = buildInput();
    if (!input) return;
    startTransition(async () => {
      try {
        await actionCreateContract(input);
        toast.success("Contrato creado en estado borrador. Actívalo para generar las rentas.");
        onCreated();
        close(false);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al crear el contrato.";
        toast.error(msg);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nuevo contrato</DialogTitle>
            <DialogDescription>
              Paso {step} de 4 — {step === 1 ? "Unidad" : step === 2 ? "Inquilino" : step === 3 ? "Términos" : "Confirmación"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  n <= step ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {n}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <StepUnit
              units={availableUnits}
              value={unitId}
              onChange={setUnitId}
            />
          ) : null}

          {step === 2 ? (
            <StepLessee
              search={search}
              results={results}
              searching={searching}
              selectedId={lesseeId}
              selectedLabel={lesseeLabel}
              onSearch={runSearch}
              onPick={pickLessee}
              onCreateNew={() => setCreateLesseeOpen(true)}
              locked={Boolean(initialLessee)}
            />
          ) : null}

          {step === 3 ? <StepTerms terms={terms} onChange={setTerms} /> : null}

          {step === 4 ? (
            <StepConfirm
              unit={selectedUnit}
              lesseeLabel={lesseeLabel}
              terms={terms}
            />
          ) : null}

          <Separator />
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
              disabled={step === 1 || pending}
            >
              <ArrowLeft className="size-4" />
              Atrás
            </Button>
            {step < 4 ? (
              <Button
                onClick={() => {
                  if (step === 1) onUnitNext();
                  else if (step === 2) onLesseeNext();
                  else if (step === 3) onTermsNext();
                }}
              >
                Siguiente
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={onConfirm} disabled={pending}>
                <Check className="size-4" />
                {pending ? "Creando..." : "Crear contrato"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createLesseeOpen} onOpenChange={setCreateLesseeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo inquilino</DialogTitle>
            <DialogDescription>
              Captura los datos del inquilino. Quedará seleccionado para este contrato.
            </DialogDescription>
          </DialogHeader>
          <LesseeForm
            onSuccess={(l) => {
              pickLessee({
                id: l.id,
                legalName: l.legalName,
                contactName: l.contactName,
                rfc: l.rfc,
              });
              setCreateLesseeOpen(false);
            }}
            submitLabel="Crear y seleccionar"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================================================
// Steps
// =============================================================================

function StepUnit({
  units,
  value,
  onChange,
}: {
  units: ReadonlyArray<AvailableUnit>;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => {
      const hay =
        u.code + " " + (u.name ?? "") + " " + u.property.name;
      return hay.toLowerCase().includes(q);
    });
  }, [units, filter]);

  // Agrupa unidades por inmueble para mostrarlas organizadas (la plaza es el
  // contexto, el local es lo que se contrata).
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { name: string; type: AvailableUnit["property"]["type"]; units: AvailableUnit[] }
    >();
    for (const u of filtered) {
      const key = u.property.id;
      const existing = map.get(key);
      if (existing) {
        existing.units.push(u);
      } else {
        map.set(key, { name: u.property.name, type: u.property.type, units: [u] });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  if (units.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No hay unidades disponibles. Marca alguna como DISPONIBLE en su detalle
        de inmueble.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">Selecciona el local a contratar</Label>
        <span className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "disponible" : "disponibles"}
        </span>
      </div>

      {units.length > 5 ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por local, plaza o inmueble..."
        />
      ) : null}

      <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
        {groups.map((g) => (
          <div key={g.name} className="space-y-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {/* En plazas el encabezado es el nombre; en inmuebles individuales
                  la card ya muestra el nombre, así que arriba va el tipo. */}
              {isPlaza(g.type) ? g.name : propertyTypeLabel(g.type)}
            </p>
            <div className="space-y-1.5">
              {g.units.map((u) => {
                const selected = value === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onChange(u.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
                      selected
                        ? "border-primary ring-2 ring-primary/20"
                        : "hover:border-foreground/30 hover:bg-muted/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold leading-tight">
                        {isPlaza(u.property.type) ? (
                          <>
                            {unitCode(u)}
                            {u.name ? (
                              <span className="font-normal text-foreground/80">
                                {" "}
                                — {u.name}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          // Un inmueble individual ES el espacio rentable: lo
                          // identificamos por su nombre, no por un código "LP".
                          u.property.name
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {u.estimatedRent !== null
                          ? `Renta estimada: ${formatMXN(u.estimatedRent)}/mes`
                          : "Sin renta estimada"}
                      </p>
                    </div>
                    <Badge
                      variant={u.status === "DISPONIBLE" ? "secondary" : "outline"}
                      className="shrink-0"
                    >
                      {unitStatusLabel(u.status)}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay locales que coincidan con &ldquo;{filter}&rdquo;.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StepLessee({
  search,
  results,
  searching,
  selectedId,
  selectedLabel,
  onSearch,
  onPick,
  onCreateNew,
  locked,
}: {
  search: string;
  results: LesseeSearchResult[];
  searching: boolean;
  selectedId: string | null;
  selectedLabel: string;
  onSearch: (q: string) => void;
  onPick: (l: LesseeSearchResult) => void;
  onCreateNew: () => void;
  locked: boolean;
}) {
  // Cuando el wizard se lanza desde el detalle de un inquilino, éste viene fijo:
  // no mostramos búsqueda ni lista, solo confirmamos quién es.
  if (locked) {
    return (
      <div className="space-y-3">
        <Label>Inquilino</Label>
        <div className="rounded-md border bg-secondary/40 p-3 text-sm">
          <span className="text-muted-foreground">Seleccionado: </span>
          <span className="font-medium">{selectedLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label>Buscar inquilino</Label>
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={onCreateNew}>
          <Plus className="size-4" />
          Crear nuevo
        </Button>
      </div>

      {selectedId ? (
        <div className="rounded-md border bg-secondary/40 p-3 text-sm">
          <span className="text-muted-foreground">Seleccionado: </span>
          <span className="font-medium">{selectedLabel}</span>
        </div>
      ) : null}

      <div className="rounded-md border">
        {searching ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Buscando...</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Sin coincidencias. Crea un inquilino nuevo si no existe.
          </p>
        ) : (
          <ul className="divide-y">
            {results.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 ${
                    l.id === selectedId ? "bg-secondary/40" : ""
                  }`}
                  onClick={() => onPick(l)}
                >
                  <p className="font-medium">{l.legalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.contactName ?? "—"}
                    {l.rfc ? ` · RFC ${l.rfc}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StepTerms({
  terms,
  onChange,
}: {
  terms: DraftTerms;
  onChange: (t: DraftTerms) => void;
}) {
  function set<K extends keyof DraftTerms>(key: K, value: DraftTerms[K]) {
    onChange({ ...terms, [key]: value });
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <Label>Tipo de contrato</Label>
        <EnumSelect
          values={CONTRACT_TYPES}
          labelFor={contractTypeLabel}
          value={terms.type}
          onValueChange={(v) => set("type", v)}
          placeholder="Tipo"
        />
      </div>
      <div className="space-y-1">
        <Label>Día de pago (1-28)</Label>
        <Input
          type="number"
          min="1"
          max="28"
          value={terms.paymentDay}
          onChange={(e) => set("paymentDay", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Fecha inicio</Label>
        <Input
          type="date"
          value={terms.startDate}
          onChange={(e) => set("startDate", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Fecha fin</Label>
        <Input
          type="date"
          value={terms.endDate}
          onChange={(e) => set("endDate", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Renta mensual (MXN)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={terms.monthlyAmount}
          onChange={(e) => set("monthlyAmount", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Fianza (MXN)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={terms.guaranteeAmount}
          onChange={(e) => set("guaranteeAmount", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Interés moratorio (%)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={terms.lateFeePercentage}
          onChange={(e) => set("lateFeePercentage", e.target.value)}
        />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={terms.autoRenew}
            onChange={(e) => set("autoRenew", e.target.checked)}
          />
          Auto-renovar al vencer
        </label>
      </div>

      <div className="md:col-span-2 space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={terms.paidInAdvance}
            onChange={(e) => set("paidInAdvance", e.target.checked)}
          />
          Pago adelantado
        </label>
        {terms.paidInAdvance ? (
          <div className="space-y-1">
            <Label>Pagado hasta</Label>
            <Input
              type="date"
              value={terms.advancePaidUntil}
              onChange={(e) => set("advancePaidUntil", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Todos los meses hasta esta fecha (incluido el mes seleccionado) se
              marcarán como pagados al activar el contrato. Los meses posteriores
              se cobran normalmente.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label>Notas</Label>
        <Textarea
          rows={3}
          value={terms.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </div>
  );
}

function StepConfirm({
  unit,
  lesseeLabel,
  terms,
}: {
  unit: AvailableUnit | null;
  lesseeLabel: string;
  terms: DraftTerms;
}) {
  return (
    <div className="space-y-3 rounded-md border bg-card p-4 text-sm">
      <Row label="Unidad">
        {unit ? (
          isPlaza(unit.property.type) ? (
            <>
              <span className="font-medium">{unit.property.name}</span> · {unitCode(unit)}
              {unit.name ? ` (${unit.name})` : ""}
            </>
          ) : (
            <span className="font-medium">{unit.property.name}</span>
          )
        ) : (
          "—"
        )}
      </Row>
      <Row label="Inquilino">{lesseeLabel}</Row>
      <Row label="Tipo">{contractTypeLabel(terms.type)}</Row>
      <Row label="Vigencia">
        {terms.startDate ? capitalizeFirst(DATE.format(new Date(terms.startDate))) : "—"} →{" "}
        {terms.endDate ? capitalizeFirst(DATE.format(new Date(terms.endDate))) : "—"}
      </Row>
      <Row label="Renta mensual">
        {terms.monthlyAmount ? formatMXN(terms.monthlyAmount, 2) : "—"}
      </Row>
      <Row label="Fianza">
        {terms.guaranteeAmount ? formatMXN(terms.guaranteeAmount, 2) : "—"}
      </Row>
      <Row label="Día de cobro">{terms.paymentDay}</Row>
      {terms.lateFeePercentage ? (
        <Row label="Interés moratorio">{terms.lateFeePercentage}%</Row>
      ) : null}
      {terms.paidInAdvance ? (
        <Row label="Pago adelantado">
          <Badge>Hasta {terms.advancePaidUntil || "—"}</Badge>
        </Row>
      ) : null}
      <Separator />
      <p className="text-xs text-muted-foreground">
        Se creará en estado <Badge variant="secondary">DRAFT</Badge>. Para empezar a generar
        cargos mensuales, actívalo desde el detalle.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-44 text-xs uppercase text-muted-foreground">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
