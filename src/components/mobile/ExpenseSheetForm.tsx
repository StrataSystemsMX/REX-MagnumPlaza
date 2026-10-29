"use client";

import { Camera, Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MobileCard, mobileChipClass } from "@/components/mobile/MobileUI";
import { MobileSheetCta, MobileSwitch } from "@/components/mobile/MobileSheet";
import { formatMXN } from "@/shared/format-currency";
import { parseAmountInput, todayDateInput } from "@/shared/mobile/input";
import { actionUploadExpenseDocument } from "@/server/services/expense-documents";
import { actionCreateExpense } from "@/server/services/expenses";
import type { MobileCaptureOptions } from "@/server/services/mobile-actions";
import { cn } from "@/shared/utils";
import { createExpenseSchema } from "@/shared/validators/expense";

/** Categorías visibles antes de "Ver todas" (las más usadas van primero). */
const TOP_CATEGORIES = 8;

export function ExpenseSheetForm({
  options,
  onDone,
}: {
  options: MobileCaptureOptions;
  onDone: () => void;
}) {
  const defaultLe =
    options.legalEntities.find((le) => le.code === "CRT") ?? options.legalEntities[0] ?? null;

  const [photo, setPhoto] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [legalEntityId, setLegalEntityId] = useState<string | null>(defaultLe?.id ?? null);
  // null = "Oficina" (egreso general, sin inmueble).
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const categories = showAllCategories
    ? options.categories
    : options.categories.slice(0, TOP_CATEGORIES);

  function pickProperty(id: string | null) {
    setPropertyId(id);
    // El egreso de un inmueble lo paga, por defecto, quien lo administra.
    const property = options.properties.find((p) => p.id === id);
    if (property) setLegalEntityId(property.managerEntityId);
  }

  function submit() {
    const numericAmount = parseAmountInput(amount);
    if (!(numericAmount > 0)) {
      setError("Ingresa el monto del egreso.");
      return;
    }
    const category = options.categories.find((c) => c.id === categoryId);
    const property = options.properties.find((p) => p.id === propertyId);
    const parsed = createExpenseSchema.safeParse({
      legalEntityId: legalEntityId ?? "",
      categoryId: categoryId ?? "",
      propertyId,
      amount: numericAmount,
      expenseDate: todayDateInput(),
      description: `${category?.name ?? "Egreso"} — ${property?.name ?? "Oficina"}`,
      isPaid,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const created = await actionCreateExpense(parsed.data);
        let withReceipt = false;
        if (photo) {
          try {
            const formData = new FormData();
            formData.set("expenseId", created.id);
            formData.set("file", photo);
            await actionUploadExpenseDocument(formData);
            withReceipt = true;
          } catch (e) {
            console.error("[mobile] receipt upload failed", e);
            toast.warning("El egreso se guardó, pero no se pudo subir el comprobante.");
          }
        }
        toast.success(
          `Egreso de ${formatMXN(numericAmount, 2)} guardado${withReceipt ? " con comprobante" : ""}.`,
        );
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar el egreso.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <label
        className={cn(
          "flex h-[130px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed text-primary",
          photo ? "border-green-500 bg-green-50" : "border-border bg-card",
        )}
      >
        {photo ? <Check className="size-7 text-green-600" /> : <Camera className="size-7" strokeWidth={1.8} />}
        <span className="text-sm font-medium">
          {photo ? "Comprobante listo" : "Tomar foto del comprobante"}
        </span>
        <span className="max-w-[80%] truncate text-[11.5px] text-muted-foreground">
          {photo ? photo.name : "Factura, recibo o ticket"}
        </span>
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
      </label>

      <MobileCard className="flex items-baseline gap-1 px-3.5 py-3">
        <label htmlFor="mobile-expense-amount" className="flex-1 text-[13px] text-muted-foreground">
          Monto
        </label>
        <span className="text-[22px] font-semibold text-muted-foreground">$</span>
        <input
          id="mobile-expense-amount"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          className="w-[150px] bg-transparent text-right text-2xl font-semibold tabular-nums outline-none"
        />
      </MobileCard>

      <div className="flex flex-col gap-2">
        <span className="px-1 text-[13px] font-medium">Categoría</span>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={mobileChipClass(categoryId === c.id)}
            >
              {c.name}
            </button>
          ))}
          {options.categories.length > TOP_CATEGORIES ? (
            <button
              type="button"
              onClick={() => setShowAllCategories((v) => !v)}
              className="rounded-full px-2 py-1.5 text-[13px] font-medium text-primary"
            >
              {showAllCategories ? "Ver menos" : "Ver todas"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="px-1 text-[13px] font-medium">Razón social</span>
        <div className="flex rounded-[10px] bg-muted p-[3px]">
          {options.legalEntities.map((le) => (
            <button
              key={le.id}
              type="button"
              aria-pressed={legalEntityId === le.id}
              onClick={() => setLegalEntityId(le.id)}
              className={cn(
                "flex-1 rounded-[7px] py-2 text-sm font-medium",
                legalEntityId === le.id
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(11,14,41,.12)]"
                  : "text-muted-foreground",
              )}
            >
              {le.code}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="px-1 text-[13px] font-medium">Inmueble</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={propertyId === null}
            onClick={() => pickProperty(null)}
            className={mobileChipClass(propertyId === null)}
          >
            Oficina
          </button>
          {options.properties.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={propertyId === p.id}
              onClick={() => pickProperty(p.id)}
              className={mobileChipClass(propertyId === p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <MobileCard className="overflow-hidden">
        <MobileSwitch checked={isPaid} onChange={setIsPaid} label="Ya está pagado" />
      </MobileCard>

      {error ? <div className="px-1 text-[12.5px] text-rose-600">{error}</div> : null}

      <MobileSheetCta onClick={submit} disabled={pending}>
        {pending ? <Loader2 className="mx-auto size-5 animate-spin" /> : "Guardar egreso"}
      </MobileSheetCta>
    </div>
  );
}
