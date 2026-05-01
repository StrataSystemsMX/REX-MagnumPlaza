"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { communicationChannelLabel } from "@/lib/i18n/enums";
import {
  createLesseeSchema,
  type CreateLesseeInput,
} from "@/lib/validators/lessee";
import {
  actionCreateLessee,
  actionUpdateLessee,
} from "@/lib/services/lessees";
import type { CommunicationChannel } from "@/generated/prisma/enums";
import type { LesseeModel } from "@/generated/prisma/models";

const CHANNELS: ReadonlyArray<CommunicationChannel> = [
  "WHATSAPP",
  "EMAIL",
  "SMS",
  "PHONE_CALL",
  "IN_PERSON",
];

export interface LesseeFormInitial {
  id?: string;
  legalName: string;
  contactName?: string | null;
  rfc?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferredChannel: CommunicationChannel;
  notes?: string | null;
}

interface LesseeFormProps {
  initial?: LesseeFormInitial;
  onSuccess?: (lessee: LesseeModel) => void;
  submitLabel?: string;
}

export function LesseeForm({ initial, onSuccess, submitLabel = "Guardar" }: LesseeFormProps) {
  const isEdit = Boolean(initial?.id);
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateLesseeInput>({
    resolver: zodResolver(createLesseeSchema),
    defaultValues: {
      legalName: initial?.legalName ?? "",
      contactName: initial?.contactName ?? "",
      rfc: initial?.rfc ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      whatsapp: initial?.whatsapp ?? "",
      preferredChannel: initial?.preferredChannel ?? "WHATSAPP",
      notes: initial?.notes ?? "",
    },
  });

  function onSubmit(values: CreateLesseeInput) {
    startTransition(async () => {
      try {
        const result =
          isEdit && initial?.id
            ? await actionUpdateLessee(initial.id, values)
            : await actionCreateLessee(values);
        toast.success(isEdit ? "Inquilino actualizado." : "Inquilino creado.");
        onSuccess?.(result);
        form.reset(values);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error al guardar.";
        toast.error(message);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="legalName"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Razón social</FormLabel>
                <FormControl>
                  <Input placeholder="Farmacias Benavides S.A.B de C.V." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Persona de contacto</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Juan Pablo Martinez"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rfc"
            render={({ field }) => (
              <FormItem>
                <FormLabel>RFC</FormLabel>
                <FormControl>
                  <Input
                    placeholder="XAXX010101000"
                    {...field}
                    value={field.value ?? ""}
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
                <FormLabel>Correo electrónico</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="contacto@empresa.com"
                    {...field}
                    value={field.value ?? ""}
                  />
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
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input
                    placeholder="+526621234567"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="whatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WhatsApp</FormLabel>
                <FormControl>
                  <Input
                    placeholder="+526621234567"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="preferredChannel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Canal preferido</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un canal" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {communicationChannelLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Notas</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Historial, particularidades, observaciones..."
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
