"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { actionCreatePromoter } from "@/server/services/promoters";
import { CharacterCount } from "@/components/ui/character-count";
import { createPromoterSchema, type CreatePromoterInput } from "@/shared/validators/promoter";

export function NewPromoterDialog() {
  const [open, setOpen] = useState(false);

  const form = useForm<CreatePromoterInput>({
    resolver: zodResolver(createPromoterSchema),
    defaultValues: { fullName: "", phone: "", email: "", agency: "", notes: "" },
  });

  async function onSubmit(values: CreatePromoterInput) {
    try {
      await actionCreatePromoter(values);
      toast.success("Promotor registrado.");
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Error al registrar el promotor.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        Registrar promotor
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar promotor</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Juan Pérez" {...field} maxLength={50} />
                  </FormControl>
                  <CharacterCount current={field.value?.length ?? 0} max={50} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono / WhatsApp</FormLabel>
                    <FormControl>
                      <Input placeholder="6621234567" {...field} maxLength={15} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="agency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agencia (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="NEX, Independiente..." {...field} value={field.value ?? ""} maxLength={60} />
                    </FormControl>
                    <CharacterCount current={(field.value ?? "").length} max={60} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (opcional)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="promotor@email.com" {...field} value={field.value ?? ""} maxLength={100} />
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
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Especialidad, historial..." {...field} value={field.value ?? ""} maxLength={300} />
                  </FormControl>
                  <CharacterCount current={(field.value ?? "").length} max={300} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
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
