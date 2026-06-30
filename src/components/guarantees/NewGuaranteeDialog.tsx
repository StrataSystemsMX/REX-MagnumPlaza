"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionCreateGuarantee } from "@/lib/services/guarantees";
import { createGuaranteeSchema, type CreateGuaranteeInput } from "@/lib/validators/guarantee";
import type { ContractForGuarantee } from "@/lib/services/guarantees-queries";
import { unitWithProperty } from "@/lib/i18n/unit-label";
import { formatMXN } from "@/lib/format-currency";

interface Props {
  contracts: ContractForGuarantee[];
}

export function NewGuaranteeDialog({ contracts }: Props) {
  const [open, setOpen] = useState(false);
  const contractItems = Object.fromEntries(
    contracts.map((c) => [c.id, `${c.lessee.legalName} — ${unitWithProperty(c.unit, " ")}`]),
  );

  const form = useForm<CreateGuaranteeInput>({
    resolver: zodResolver(createGuaranteeSchema) as unknown as Resolver<CreateGuaranteeInput>,
    defaultValues: { contractId: "", amount: undefined, notes: "" },
  });

  const selectedContractId = form.watch("contractId");
  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  async function onSubmit(values: CreateGuaranteeInput) {
    try {
      await actionCreateGuarantee(values);
      toast.success("Fianza registrada.");
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Error al registrar el depósito.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        Registrar fianza
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar fianza</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="contractId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} items={contractItems}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un contrato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.lessee.legalName} — {unitWithProperty(c.unit, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedContract && (
                    <p className="text-xs text-muted-foreground">
                      Fianza sugerida: {formatMXN(selectedContract.guaranteeAmount, 2)}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto recibido (MXN)</FormLabel>
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
              name="receivedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de recepción</FormLabel>
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
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
