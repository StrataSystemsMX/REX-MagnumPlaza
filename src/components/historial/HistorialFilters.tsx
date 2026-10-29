"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumSelect } from "@/components/ui/enum-select";
import { Input } from "@/components/ui/input";
import {
  AUDIT_CATEGORIES,
  auditCategoryLabel,
  type AuditCategory,
} from "@/shared/audit/categories";
import { auditActionLabel } from "@/shared/i18n/enums";
import type { AuditAction } from "@/generated/prisma/enums";

const ALL = "ALL";
const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "RESTORE"];

interface UserOption {
  id: string;
  name: string;
  email: string;
}

/**
 * Barra de filtros del historial. Escribe el estado en la URL (igual que
 * PropertyFilterTabs) para que la query del servidor sea la fuente de verdad.
 */
export function HistorialFilters({ users }: { users: ReadonlyArray<UserOption> }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? ALL;
  const action = searchParams.get("action") ?? ALL;
  const userId = searchParams.get("userId") ?? ALL;
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const hasFilters =
    [category, action, userId].some((v) => v !== ALL) || from !== "" || to !== "";

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === ALL) params.delete(key);
    else params.set(key, value);
    params.delete("page"); // cualquier cambio de filtro vuelve a la página 1
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  function clearAll() {
    router.replace("?", { scroll: false });
  }

  const categoryValues: string[] = [ALL, ...AUDIT_CATEGORIES];
  const actionValues: string[] = [ALL, ...ACTIONS];
  const userValues: string[] = [ALL, ...users.map((u) => u.id)];
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Área">
        <EnumSelect
          values={categoryValues}
          value={category}
          labelFor={(v) =>
            v === ALL ? "Todas las áreas" : auditCategoryLabel(v as AuditCategory)
          }
          onValueChange={(v) => setParam("category", v)}
          triggerClassName="w-44"
        />
      </Field>

      <Field label="Acción">
        <EnumSelect
          values={actionValues}
          value={action}
          labelFor={(v) =>
            v === ALL ? "Todas las acciones" : auditActionLabel(v as AuditAction)
          }
          onValueChange={(v) => setParam("action", v)}
          triggerClassName="w-44"
        />
      </Field>

      <Field label="Usuario">
        <EnumSelect
          values={userValues}
          value={userId}
          labelFor={(v) => (v === ALL ? "Todos los usuarios" : userName(v))}
          onValueChange={(v) => setParam("userId", v)}
          triggerClassName="w-48"
        />
      </Field>

      <Field label="Desde">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setParam("from", e.target.value)}
          className="w-40"
        />
      </Field>

      <Field label="Hasta">
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setParam("to", e.target.value)}
          className="w-40"
        />
      </Field>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
          <X className="size-4" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
