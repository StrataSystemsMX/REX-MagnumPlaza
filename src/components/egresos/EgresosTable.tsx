"use client";

import {
  HandCoins,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseFormDialog } from "@/components/egresos/ExpenseFormDialog";
import {
  actionDeleteExpense,
  actionMarkExpensePaid,
  actionUnmarkExpensePaid,
} from "@/lib/services/expenses";
import type {
  ExpenseCategoryOption,
  ExpenseListItem,
  ExpensePropertyOption,
} from "@/lib/services/expenses-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";

const ALL = "ALL";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const MONTHS: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL, label: "Todos" },
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

interface Props {
  expenses: ReadonlyArray<ExpenseListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  categories: ReadonlyArray<ExpenseCategoryOption>;
  properties: ReadonlyArray<ExpensePropertyOption>;
  yearsAvailable: ReadonlyArray<number>;
  selectedYear: number;
  selectedMonth: number | null;
  selectedLegalEntityId: string | null;
  selectedCategoryId: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function EgresosTable({
  expenses,
  legalEntities,
  categories,
  properties,
  yearsAvailable,
  selectedYear,
  selectedMonth,
  selectedLegalEntityId,
  selectedCategoryId,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formInitial, setFormInitial] = useState<ExpenseListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseListItem | null>(
    null,
  );
  const [unmarkTarget, setUnmarkTarget] = useState<ExpenseListItem | null>(
    null,
  );
  const [markingId, setMarkingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    const byEntity = new Map<string, { code: string; amount: number }>();
    for (const e of expenses) {
      total += e.amount;
      if (e.isPaid) paid += e.amount;
      else pending += e.amount;
      const prev = byEntity.get(e.legalEntity.id);
      if (prev) {
        prev.amount += e.amount;
      } else {
        byEntity.set(e.legalEntity.id, {
          code: e.legalEntity.code,
          amount: e.amount,
        });
      }
    }
    return {
      total,
      paid,
      pending,
      byEntity: Array.from(byEntity.values()).sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    };
  }, [expenses]);

  const yearItems: Record<string, string> = useMemo(
    () => Object.fromEntries(yearsAvailable.map((y) => [String(y), String(y)])),
    [yearsAvailable],
  );

  const monthItems: Record<string, string> = useMemo(
    () => Object.fromEntries(MONTHS.map((m) => [m.value, m.label])),
    [],
  );

  const categoryItems: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = { [ALL]: "Todas" };
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/egresos?${params.toString()}`);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteExpense({ id: target.id });
        toast.success("Egreso eliminado.");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar.");
      }
    });
  }

  function markPaid(target: ExpenseListItem) {
    setMarkingId(target.id);
    startTransition(async () => {
      try {
        await actionMarkExpensePaid({ id: target.id });
        toast.success("Egreso registrado como pagado.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar.");
      } finally {
        setMarkingId(null);
      }
    });
  }

  function confirmUnmark() {
    if (!unmarkTarget) return;
    const target = unmarkTarget;
    startTransition(async () => {
      try {
        await actionUnmarkExpensePaid({ id: target.id });
        toast.success("Egreso desmarcado.");
        setUnmarkTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Año">
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => v && setParam("year", v)}
              items={yearItems}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearsAvailable.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Mes">
            <Select
              value={selectedMonth ? String(selectedMonth) : ALL}
              onValueChange={(v) => v && setParam("month", v)}
              items={monthItems}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Categoría">
            <Select
              value={selectedCategoryId ?? ALL}
              onValueChange={(v) => v && setParam("category", v)}
              items={categoryItems}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        {canCreate ? (
          <Button
            onClick={() => {
              setFormInitial(null);
              setFormMode("create");
            }}
          >
            <Plus className="size-4" />
            Nuevo egreso
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total egresos" value={MXN.format(totals.total)} />
        <Stat
          label="Pagado"
          value={MXN.format(totals.paid)}
          tone="positive"
        />
        <Stat
          label="Pendiente"
          value={MXN.format(totals.pending)}
          tone="warning"
        />
        <Stat
          label="Movimientos"
          value={expenses.length.toLocaleString("es-MX")}
          tone="muted"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setParam("legalEntity", ALL)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            selectedLegalEntityId === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent",
          )}
        >
          Todas
        </button>
        {legalEntities.map((e) => {
          const active = selectedLegalEntityId === e.id;
          const entityTotal = totals.byEntity.find((b) => b.code === e.code);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setParam("legalEntity", active ? ALL : e.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              {e.code}
              {entityTotal ? (
                <span
                  className={cn(
                    "ml-2 tabular-nums",
                    active ? "opacity-90" : "text-muted-foreground",
                  )}
                >
                  {MXN.format(entityTotal.amount)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Razón social</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-44 text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground"
                >
                  Sin egresos para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">
                    {DATE.format(e.expenseDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{e.legalEntity.code}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.category.name}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{e.description}</div>
                    {e.vendor ? (
                      <div className="text-xs text-muted-foreground">
                        {e.vendor}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {MXN.format(e.amount)}
                  </TableCell>
                  <TableCell>
                    {e.isPaid ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
                        Pagado
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pendiente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canUpdate && !e.isPaid ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={markingId === e.id}
                          onClick={() => markPaid(e)}
                        >
                          {markingId === e.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <HandCoins className="size-4" />
                          )}
                          Registrar egreso
                        </Button>
                      ) : null}
                      {canUpdate || canDelete ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon" />}
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Acciones</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdate && e.isPaid ? (
                              <DropdownMenuItem
                                onClick={() => setUnmarkTarget(e)}
                              >
                                <RotateCcw className="size-4" />
                                Desmarcar pago
                              </DropdownMenuItem>
                            ) : null}
                            {canUpdate ? (
                              <DropdownMenuItem
                                onClick={() => {
                                  setFormInitial(e);
                                  setFormMode("edit");
                                }}
                              >
                                <Pencil className="size-4" />
                                Editar
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete ? (
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(e)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                                Eliminar
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ExpenseFormDialog
        mode={formMode}
        initial={formInitial}
        legalEntities={legalEntities}
        categories={categories}
        properties={properties}
        defaultLegalEntityId={selectedLegalEntityId}
        onClose={() => {
          setFormMode(null);
          setFormInitial(null);
        }}
      />

      <AlertDialog
        open={unmarkTarget !== null}
        onOpenChange={(o) => !o && !pending && setUnmarkTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desmarcar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              El egreso volverá a estado pendiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmUnmark();
              }}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Desmarcar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !pending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar egreso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará permanentemente el egreso de{" "}
              {deleteTarget ? MXN.format(deleteTarget.amount) : ""} —{" "}
              {deleteTarget?.description}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning" | "muted";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
