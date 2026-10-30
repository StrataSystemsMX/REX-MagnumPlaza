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
import { EnumSelect } from "@/components/ui/enum-select";
import { Textarea } from "@/components/ui/textarea";
import { communicationChannelLabel } from "@/shared/i18n/enums";
import {
  createLesseeSchema,
  type CreateLesseeInput,
} from "@/shared/validators/lessee";
import { CharacterCount } from "@/components/ui/character-count";
import {
  actionCreateLessee,
  actionUpdateLessee,
} from "@/server/services/lessees";
import type { CommunicationChannel } from "@/generated/prisma/enums";
import type { LesseeModel } from "@/generated/prisma/models";

const CHANNELS: ReadonlyArray<CommunicationChannel> = [
  "WHATSAPP",
  "EMAIL",
  "SMS",
  "PHONE_CALL",
  "IN_PERSON",
];

function formatMxPhoneDisplay(input: string): string {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("52") && digits.length > 10 ? digits.slice(-10) : digits;
  const ten = local.slice(0, 10);
  if (ten.length === 0) return "";
  if (ten.length <= 3) return `(${ten}`;
  if (ten.length <= 6) return `(${ten.slice(0, 3)}) ${ten.slice(3)}`;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)} ${ten.slice(6)}`;
}

export interface LesseeFormInitial {
  id?: string;
  legalName: string;
  contactName?: string | null;
  rfc?: string | null;
  fiscalAddress?: string | null;
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
      fiscalAddress: initial?.fiscalAddress ?? "",
      email: initial?.email ?? "",
      phone: formatMxPhoneDisplay(initial?.phone ?? ""),
      whatsapp: formatMxPhoneDisplay(initial?.whatsapp ?? ""),
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
                  <Input {...field} maxLength={100} />
                </FormControl>
                <CharacterCount current={field.value?.length ?? 0} max={100} />
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
                  <Input {...field} value={field.value ?? ""} maxLength={50} />
                </FormControl>
                <CharacterCount current={(field.value ?? "").length} max={50} />
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
                  <Input {...field} value={field.value ?? ""} maxLength={13} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fiscalAddress"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Domicilio fiscal</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} maxLength={255} />
                </FormControl>
                <CharacterCount current={(field.value ?? "").length} max={255} />
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
                  <Input type="email" {...field} value={field.value ?? ""} />
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
                    inputMode="tel"
                    placeholder="(662) 429 6727"
                    value={field.value ?? ""}
                    maxLength={15}
                    onChange={(e) => field.onChange(formatMxPhoneDisplay(e.target.value))}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
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
                    inputMode="tel"
                    placeholder="(662) 429 6727"
                    value={field.value ?? ""}
                    maxLength={15}
                    onChange={(e) => field.onChange(formatMxPhoneDisplay(e.target.value))}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
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
                <EnumSelect
                  values={CHANNELS}
                  labelFor={communicationChannelLabel}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Selecciona un canal"
                />
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
                  <Textarea rows={3} {...field} value={field.value ?? ""} maxLength={1000} />
                </FormControl>
                <CharacterCount current={(field.value ?? "").length} max={1000} />
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
