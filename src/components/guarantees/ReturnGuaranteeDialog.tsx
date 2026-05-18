"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { actionApplyGuaranteeToDebt, actionReturnGuarantee } from "@/lib/services/guarantees";
import { returnGuaranteeSchema, type ReturnGuaranteeInput } from "@/lib/validators/guarantee";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

interface Props {
  guaranteeId: string;
  totalAmount: number;
  lesseeName: string;
}

export function ReturnGuaranteeDialog({ guaranteeId, totalAmount, lesseeName }: Props) {
  const [open, setOpen] = useState(false);
  const [applyingToDebt, setApplyingToDebt] = useState(false);

  const form = useForm<ReturnGuaranteeInput>({
    resolver: zodResolver(returnGuaranteeSchema) as unknown as Resolver<ReturnGuaranteeInput>,
    defaultValues: {
      guaranteeId,
      returnedAmount: undefined,
      deductions: [],
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "deductions",
  });

  const deductions = form.watch("deductions");
  const totalDeducted = deductions.reduce((acc, d) => acc + (d.amount || 0), 0);
  const net = totalAmount - totalDeducted;

  async function onSubmit(values: ReturnGuaranteeInput) {
    try {
      await actionReturnGuarantee(values);
      toast.success("Devolución registrada correctamente.");
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Error al registrar la devolución.");
    }
  }

  async function onApplyToDebt() {
    setApplyingToDebt(true);
    try {
      await actionApplyGuaranteeToDebt({ guaranteeId });
      toast.success("Depósito aplicado al saldo pendiente.");
      setOpen(false);
    } catch {
      toast.error("Error al aplicar el depósito.");
    } finally {
      setApplyingToDebt(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Cerrar depósito
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar depósito — {lesseeName}</DialogTitle>
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
                <FormLabel>Deducciones por daños</FormLabel>
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto devuelto (MXN)</FormLabel>
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
                          ? field.value.toISOString().slice(0, 10)
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
                    <Textarea rows={2} placeholder="Observaciones..." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={applyingToDebt}
                onClick={onApplyToDebt}
              >
                {applyingToDebt ? "Aplicando..." : "Aplicar a saldo"}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Guardando..." : "Registrar devolución"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
