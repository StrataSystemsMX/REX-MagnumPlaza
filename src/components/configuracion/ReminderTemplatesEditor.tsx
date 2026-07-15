"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  actionResetReminderTemplate,
  actionUpsertReminderTemplate,
  type ReminderTemplateEntry,
} from "@/lib/services/document-templates";
import {
  upsertReminderTemplateSchema,
  type UpsertReminderTemplateInput,
} from "@/lib/validators/document-template";

const LEVEL_LABELS: Record<string, string> = {
  "1M": "Recordatorio amable (1 mes)",
  "2M": "Aviso formal de adeudo (2 meses)",
  "3M": "Notificación de desalojo (3 meses)",
};

const TOKENS = [
  "lesseeName",
  "period",
  "unitLabel",
  "daysOverdue",
  "balance",
  "lateFee",
  "contractSignedDate",
  "paymentDay",
  "billingEntityName",
];

export function ReminderTemplatesEditor({
  entries,
}: {
  entries: ReminderTemplateEntry[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Plantillas de aviso de mora</h2>
        <p className="text-sm text-muted-foreground">
          Personaliza el texto de los avisos que se generan en PDF. Si no editas
          un nivel, se usa el texto por defecto. Usa tokens entre llaves para
          insertar datos del contrato.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOKENS.map((t) => (
            <Badge key={t} variant="outline" className="font-mono text-xs">
              {`{${t}}`}
            </Badge>
          ))}
        </div>
      </div>

      {entries.map((entry) => (
        <TemplateLevelForm key={entry.level} entry={entry} />
      ))}
    </section>
  );
}

function TemplateLevelForm({ entry }: { entry: ReminderTemplateEntry }) {
  const router = useRouter();
  const [pendingReset, startReset] = useTransition();
  const [isCustom, setIsCustom] = useState(entry.isCustom);

  const form = useForm<UpsertReminderTemplateInput>({
    resolver: zodResolver(upsertReminderTemplateSchema),
    defaultValues: {
      level: entry.level,
      title: entry.current.title,
      greeting: entry.current.greeting,
      body: entry.current.body,
      legalNote: entry.current.legalNote,
      closing: entry.current.closing,
    },
  });

  async function onSubmit(values: UpsertReminderTemplateInput) {
    try {
      await actionUpsertReminderTemplate(values);
      toast.success("Plantilla guardada.");
      setIsCustom(true);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar la plantilla.",
      );
    }
  }

  function onReset() {
    startReset(async () => {
      try {
        await actionResetReminderTemplate({ level: entry.level });
        toast.success("Plantilla restaurada al texto por defecto.");
        setIsCustom(false);
        form.reset({
          level: entry.level,
          title: entry.default.title,
          greeting: entry.default.greeting,
          body: entry.default.body,
          legalNote: entry.default.legalNote,
          closing: entry.default.closing,
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo restaurar.",
        );
      }
    });
  }

  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="font-medium">{LEVEL_LABELS[entry.level] ?? entry.level}</span>
          {isCustom ? (
            <Badge variant="secondary">Personalizada</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Por defecto
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
          ▶
        </span>
      </summary>
      <div className="border-t p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="greeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saludo</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} maxLength={300} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuerpo</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} maxLength={4000} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legalNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nota legal</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} maxLength={4000} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="closing"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Despedida</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} maxLength={600} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center justify-between gap-2">
              {isCustom ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendingReset}
                  onClick={onReset}
                >
                  Restaurar por defecto
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </details>
  );
}
