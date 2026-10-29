"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unlink } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { includedServiceLabel, unitStatusLabel } from "@/shared/i18n/enums";
import {
  createUnitSchema,
  type CreateUnitInput,
} from "@/shared/validators/unit";
import { CharacterCount } from "@/components/ui/character-count";
import {
  actionCreateUnit,
  actionUngroupUnit,
  actionUpdateUnit,
} from "@/server/services/units";
import type { IncludedService, UnitStatus } from "@/generated/prisma/enums";

const UNIT_STATUSES: ReadonlyArray<UnitStatus> = [
  "DISPONIBLE",
  "APARTADA",
  "RENTADA",
  "EN_REMODELACION",
  "NO_DISPONIBLE",
];

const INCLUDED_SERVICES: ReadonlyArray<IncludedService> = [
  "AGUA",
  "LUZ",
  "GAS",
  "INTERNET",
  "MANTENIMIENTO",
  "VIGILANCIA",
  "ESTACIONAMIENTO",
];

export interface UnitFormInitial {
  id?: string;
  propertyId: string;
  code: string;
  name?: string | null;
  area?: number | null;
  estimatedRent?: number | null;
  status: UnitStatus;
  depositMonths?: number | null;
  minContractMonths?: number | null;
  maintenanceFee?: number | null;
  availableFrom?: Date | string | null;
  includedServices?: IncludedService[] | null;
  parentUnitId?: string | null;
  notes?: string | null;
}

export interface ParentUnitOption {
  id: string;
  code: string;
  name?: string | null;
}

interface UnitFormProps {
  initial: UnitFormInitial;
  /** Locales del mismo inmueble que pueden funcionar como padre. Excluye el actual y los que ya son hijos. */
  eligibleParents?: ReadonlyArray<ParentUnitOption>;
  /** Hijos agrupados bajo esta unit. Se muestran con un botón Desagrupar. */
  groupedChildren?: ReadonlyArray<{ id: string; code: string }>;
  onSuccess?: () => void;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
}

const PARENT_NONE = "__none__";

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function UnitForm({
  initial,
  eligibleParents,
  groupedChildren,
  onSuccess,
  submitLabel = "Guardar",
  secondaryAction,
}: UnitFormProps) {
  const isEdit = Boolean(initial.id);
  const [pending, startTransition] = useTransition();
  const [isUngrouping, startUngroupTransition] = useTransition();
  const router = useRouter();

  function handleUngroup(childId: string, childCode: string) {
    startUngroupTransition(async () => {
      try {
        await actionUngroupUnit(childId);
        toast.success(`Local ${childCode} desagrupado.`);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al desagrupar.";
        toast.error(msg);
      }
    });
  }

  const form = useForm<CreateUnitInput>({
    resolver: zodResolver(createUnitSchema) as unknown as Resolver<CreateUnitInput>,
    defaultValues: {
      propertyId: initial.propertyId,
      code: initial.code ?? "",
      name: initial.name ?? "",
      area: initial.area ?? undefined,
      estimatedRent: initial.estimatedRent ?? undefined,
      status: initial.status,
      depositMonths: initial.depositMonths ?? undefined,
      minContractMonths: initial.minContractMonths ?? undefined,
      maintenanceFee: initial.maintenanceFee ?? undefined,
      availableFrom: initial.availableFrom
        ? initial.availableFrom instanceof Date
          ? initial.availableFrom
          : new Date(initial.availableFrom)
        : undefined,
      includedServices: initial.includedServices ?? [],
      parentUnitId: initial.parentUnitId ?? null,
      notes: initial.notes ?? "",
    },
  });

  function onSubmit(values: CreateUnitInput) {
    startTransition(async () => {
      try {
        if (isEdit && initial.id) {
          await actionUpdateUnit(initial.id, values);
          toast.success("Unidad actualizada.");
        } else {
          await actionCreateUnit(values);
          toast.success("Unidad creada.");
        }
        onSuccess?.();
        form.reset(values);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error al guardar.";
        toast.error(message);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Identificador</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={20} />
                </FormControl>
                <CharacterCount current={field.value?.length ?? 0} max={20} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre / Inquilino actual</FormLabel>
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
            name="estimatedRent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Renta estimada (MXN)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Estado</FormLabel>
                <EnumSelect
                  values={UNIT_STATUSES}
                  labelFor={unitStatusLabel}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Selecciona estado"
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <details className="group space-y-4 border-t pt-6">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Condiciones comerciales</h3>
              <p className="text-xs text-muted-foreground">
                Información que verá el prospecto en el link público del promotor.
              </p>
            </div>
            <span
              aria-hidden
              className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform group-open:rotate-180"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </summary>
          <div className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="depositMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depósito en garantía (meses)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="36"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : Number(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="minContractMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plazo mínimo de contrato (meses)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="120"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : Number(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maintenanceFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuota de mantenimiento (MXN)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : Number(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="availableFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Disponible desde</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={toDateInputValue(field.value as Date | string | null | undefined)}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : new Date(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Déjalo vacío si está disponible inmediatamente.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="includedServices"
            render={({ field }) => {
              const selected = (field.value ?? []) as IncludedService[];
              return (
                <FormItem>
                  <FormLabel>Servicios incluidos en la renta</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {INCLUDED_SERVICES.map((s) => {
                      const checked = selected.includes(s);
                      return (
                        <label
                          key={s}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-foreground/30 bg-accent"
                              : "border-input hover:bg-accent/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-foreground"
                            checked={checked}
                            onChange={(e) => {
                              field.onChange(
                                e.target.checked
                                  ? [...selected, s]
                                  : selected.filter((v) => v !== s),
                              );
                            }}
                          />
                          <span className="whitespace-nowrap">
                            {includedServiceLabel(s)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
          </div>
        </details>

        {eligibleParents && (eligibleParents.length > 0 || initial.parentUnitId) ? (
          <div className="space-y-4 border-t pt-6">
            <div>
              <h3 className="text-sm font-semibold">Agrupación</h3>
              <p className="text-xs text-muted-foreground">
                Si este local está físicamente unido a otro (ej. pared tirada),
                selecciónalo aquí. El inquilino y contrato del padre cubrirán ambos.
              </p>
            </div>
            <FormField
              control={form.control}
              name="parentUnitId"
              render={({ field }) => {
                const value = field.value ?? PARENT_NONE;
                const parentItems: Record<string, string> = {
                  [PARENT_NONE]: "Sin agrupar",
                  ...Object.fromEntries(
                    eligibleParents.map((u) => [
                      u.id,
                      u.name ? `${u.code} · ${u.name}` : u.code,
                    ]),
                  ),
                };
                return (
                  <FormItem>
                    <FormLabel>Local padre</FormLabel>
                    <Select
                      value={typeof value === "string" ? value : PARENT_NONE}
                      onValueChange={(v) =>
                        field.onChange(v === PARENT_NONE ? null : v)
                      }
                      items={parentItems}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sin agrupar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={PARENT_NONE}>Sin agrupar</SelectItem>
                        {eligibleParents.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code}
                            {u.name ? ` · ${u.name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>
        ) : null}

        {groupedChildren && groupedChildren.length > 0 ? (
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Locales agrupados bajo {initial.code}
            </p>
            <ul className="space-y-2">
              {groupedChildren.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2"
                >
                  <span className="font-mono text-sm font-medium">{c.code}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUngrouping}
                    onClick={() => handleUngroup(c.id, c.code)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Unlink className="size-3.5" />
                    Desagrupar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas internas</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} value={field.value ?? ""} maxLength={1000} />
              </FormControl>
              <CharacterCount current={(field.value ?? "").length} max={1000} />
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>{secondaryAction}</div>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
