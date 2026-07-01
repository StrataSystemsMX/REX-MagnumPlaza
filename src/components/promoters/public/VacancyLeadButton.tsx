"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { actionCaptureLead } from "@/lib/services/leads";
import {
  captureLeadSchema,
  type CaptureLeadInput,
} from "@/lib/validators/promoter";

interface Props {
  token: string;
  /** URL wa.me prearmada; null si el tenant no tiene teléfono de contacto. */
  whatsappUrl: string | null;
  label: string;
  className?: string;
  size?: "default" | "lg";
}

export function VacancyLeadButton({
  token,
  whatsappUrl,
  label,
  className,
  size = "lg",
}: Props) {
  const [open, setOpen] = useState(false);

  const form = useForm<CaptureLeadInput>({
    resolver: zodResolver(captureLeadSchema) as unknown as Resolver<CaptureLeadInput>,
    defaultValues: { token, name: "", phone: "", email: "", message: "" },
  });

  async function onSubmit(values: CaptureLeadInput) {
    try {
      await actionCaptureLead(values);
      toast.success("¡Gracias! La administración te contactará pronto.");
      setOpen(false);
      form.reset({ token, name: "", phone: "", email: "", message: "" });
      // Abre WhatsApp para contacto inmediato, si hay teléfono.
      if (whatsappUrl) window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo enviar. Intenta de nuevo.";
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size={size} className={className ?? "bg-green-600 hover:bg-green-700"} />
        }
      >
        <MessageCircle className="size-5" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Me interesa este local</DialogTitle>
          <DialogDescription>
            Déjanos tus datos y la administración te contactará. También abriremos
            WhatsApp para que escribas de inmediato.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} maxLength={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono (WhatsApp)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      inputMode="tel"
                      maxLength={20}
                      placeholder="6621234567"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                      maxLength={254}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      {...field}
                      value={field.value ?? ""}
                      maxLength={500}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Enviando..." : "Enviar y abrir WhatsApp"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
