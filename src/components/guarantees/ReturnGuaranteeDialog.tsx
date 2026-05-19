"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionReturnGuarantee } from "@/lib/services/guarantees";
import { cn } from "@/lib/utils";
import {
  returnGuaranteeSchema,
  type ReturnGuaranteeInput,
} from "@/lib/validators/guarantee";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

interface InitialReturn {
  returnedAmount: number | null;
  returnedDate: Date | null;
  deductions: Array<{ concept: string; amount: number }> | null;
  notes: string | null;
}

interface Props {
  guaranteeId: string;
  totalAmount: number;
  lesseeName: string;
  /** Si viene, el diálogo abre en modo "editar devolución" precargado. */
  initial?: InitialReturn | null;
  /** Texto del botón disparador. */
  triggerLabel?: string;
  /** Variante visual del botón disparador. */
  triggerVariant?: "outline" | "ghost" | "default";
}

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function ReturnGuaranteeDialog({
  guaranteeId,
  totalAmount,
  lesseeName,
  initial = null,
  triggerLabel,
  triggerVariant = "outline",
}: Props) {
  const isEdit = initial !== null;
  const [open, setOpen] = useState(false);

  const initialDeductions = initial?.deductions ?? [];
  const initialDeductedSum = initialDeductions.reduce(
    (acc, d) => acc + (d.amount || 0),
    0,
  );
  const initialNet = Math.max(0, totalAmount - initialDeductedSum);
  const initialReturnedAmount = initial?.returnedAmount ?? initialNet;

  const form = useForm<ReturnGuaranteeInput>({
    resolver: zodResolver(
      returnGuaranteeSchema,
    ) as unknown as Resolver<ReturnGuaranteeInput>,
    defaultValues: {
      guaranteeId,
      returnedAmount: initialReturnedAmount,
      returnedDate: initial?.returnedDate ?? undefined,
      deductions: initialDeductions,
      notes: initial?.notes ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "deductions",
  });

  const deductions = form.watch("deductions");
  const totalDeducted = deductions.reduce((acc, d) => acc + (d.amount || 0), 0);
  const net = Math.max(0, totalAmount - totalDeducted);
  const watchedReturned = form.watch("returnedAmount");
  const numericReturned =
    typeof watchedReturned === "number" && Number.isFinite(watchedReturned)
      ? watchedReturned
      : 0;
  const returnedExceeds = numericReturned > totalAmount + 0.0001;

  // Auto-sincroniza el "monto devuelto" con el neto a devolver cuando cambian
  // las deducciones, salvo que el usuario haya tocado el campo manualmente.
  const returnedTouchedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (returnedTouchedRef.current) return;
    form.setValue("returnedAmount", net, { shouldValidate: false });
  }, [net, open, form]);

  async function onSubmit(values: ReturnGuaranteeInput) {
    if (values.returnedAmount > totalAmount) {
      form.setError("returnedAmount", {
        type: "max",
        message: `No puede exceder el depósito original (${MXN.format(totalAmount)}).`,
      });
      return;
    }
    try {
      await actionReturnGuarantee(values);
      toast.success(
        isEdit ? "Devolución actualizada." : "Devolución registrada correctamente.",
      );
      setOpen(false);
      if (!isEdit) form.reset();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar la devolución.",
      );
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      returnedTouchedRef.current = isEdit;
      form.reset({
        guaranteeId,
        returnedAmount: initialReturnedAmount,
        returnedDate: initial?.returnedDate ?? undefined,
        deductions: initialDeductions,
        notes: initial?.notes ?? "",
      });
    }
  }

  const label = triggerLabel ?? (isEdit ? "Editar devolución" : "Cerrar depósito");
  const title = isEdit ? `Editar devolución — ${lesseeName}` : `Cerrar depósito — ${lesseeName}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" />}>
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          <p className="text-muted-foreground">Depósito original</p>
          <p className="text-lg font-semibold tabular-nums">{MXN.format(totalAmount)}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Deducciones */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Deducciones por daños</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => append({ concept: "", amount: 0 })}
                >
                  <Plus className="size-3.5" />
                  Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <FormField
                      control={form.control}
                      name={`deductions.${index}.concept`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Concepto (ej. Puerta rota)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`deductions.${index}.amount`}
                      render={({ field }) => (
                        <FormItem className="w-32">
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {totalDeducted > 0 && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Total deducido:</span>
                  <span className="font-medium text-destructive tabular-nums">
                    -{MXN.format(totalDeducted)}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-md border bg-emerald-50 px-4 py-3 text-sm">
              <p className="text-muted-foreground">A devolver al inquilino</p>
              <p className="text-lg font-semibold text-emerald-700 tabular-nums">
                {MXN.format(Math.max(0, net))}
              </p>
            </div>

            <FormField
              control={form.control}
              name="returnedAmount"
              rules={{
                validate: (v) =>
                  typeof v === "number" && v > totalAmount
                    ? `No puede exceder el depósito original (${MXN.format(totalAmount)}).`
                    : true,
              }}
              render={({ field, fieldState }) => {
                const exceeds =
                  typeof field.value === "number" && field.value > totalAmount;
                return (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Monto devuelto (MXN)</FormLabel>
                      <button
                        type="button"
                        onClick={() => {
                          returnedTouchedRef.current = true;
                          field.onChange(totalAmount);
                          form.clearErrors("returnedAmount");
                        }}
                        className="shrink-0 text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                      >
                        Todo
                      </button>
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={totalAmount}
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          returnedTouchedRef.current = true;
                          field.onChange(e.target.valueAsNumber);
                        }}
                        className={cn(
                          "tabular-nums",
                          (exceeds || fieldState.error) &&
                            "border-destructive focus-visible:ring-destructive/40",
                        )}
                      />
                    </FormControl>
                    {fieldState.error ? <FormMessage /> : null}
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="returnedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de devolución</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={
                        field.value instanceof Date
                          ? toDateInput(field.value)
                          : (field.value as string) ?? ""
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Observaciones..."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  returnedExceeds ||
                  numericReturned <= 0
                }
              >
                {form.formState.isSubmitting
                  ? "Guardando..."
                  : isEdit
                    ? `Guardar ${MXN.format(numericReturned)}`
                    : `Registrar ${MXN.format(numericReturned)}`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
