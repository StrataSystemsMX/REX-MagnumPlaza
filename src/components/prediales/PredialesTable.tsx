"use client";

import {
  CheckCircle2,
  FileText,
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
import { PredialFormDialog } from "@/components/prediales/PredialFormDialog";
import { PredialReceiptsDialog } from "@/components/prediales/PredialReceiptsDialog";
import { PredialRegisterPaymentDialog } from "@/components/prediales/PredialRegisterPaymentDialog";
import {
  actionDeleteCadastralPayment,
  actionUnmarkCadastralPayment,
} from "@/lib/services/cadastral";
import type {
  CadastralListItem,
  CadastralPropertyOption,
  CadastralStatus,
} from "@/lib/services/cadastral-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";

type StatusFilter = "ALL" | CadastralStatus;

const STATUS_FILTER_ITEMS: Record<StatusFilter, string> = {
  ALL: "Todos",
  DUE: "Pendiente",
  OVERDUE: "Vencido",
  PAID: "Pagado",
  PAID_BY_THIRD_PARTY: "Paga tercero",
};

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

function statusBadge(s: CadastralStatus) {
  switch (s) {
    case "PAID":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
          Pagado
        </Badge>
      );
    case "DUE":
      return <Badge variant="secondary">Pendiente</Badge>;
    case "OVERDUE":
      return <Badge variant="destructive">Vencido</Badge>;
    case "PAID_BY_THIRD_PARTY":
      return (
        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200">
          Paga tercero
        </Badge>
      );
  }
}

interface Totals {
  total: number;
  paid: number;
  pending: number;
  thirdParty: number;
}

interface Props {
  payments: ReadonlyArray<CadastralListItem>;
  properties: ReadonlyArray<CadastralPropertyOption>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  yearsAvailable: ReadonlyArray<number>;
  selectedYear: number;
  totals: Totals;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function PredialesTable({
  payments,
  properties,
  legalEntities,
  yearsAvailable,
  selectedYear,
  totals,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Dialog states
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formInitial, setFormInitial] = useState<CadastralListItem | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<CadastralListItem | null>(
    null,
  );
  const [receiptsTarget, setReceiptsTarget] =
    useState<CadastralListItem | null>(null);
  const [unmarkTarget, setUnmarkTarget] = useState<CadastralListItem | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CadastralListItem | null>(
    null,
  );

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (ownerFilter !== "ALL" && p.ownerEntity.id !== ownerFilter) return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      return true;
    });
  }, [payments, ownerFilter, statusFilter]);

  const yearItems: Record<string, string> = useMemo(
    () => Object.fromEntries(yearsAvailable.map((y) => [String(y), String(y)])),
    [yearsAvailable],
  );

  const ownerItems: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = { ALL: "Todas" };
    for (const e of legalEntities) map[e.id] = e.code;
    return map;
  }, [legalEntities]);

  function setYearParam(y: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", y);
    router.push(`/prediales?${params.toString()}`);
  }

  function payerLabel(p: CadastralListItem): string {
    if (p.payerEntity) return p.payerEntity.code;
    if (p.paidByThirdPartyName) return p.paidByThirdPartyName;
    return p.ownerEntity.code;
  }

  function confirmUnmark() {
    if (!unmarkTarget) return;
    const target = unmarkTarget;
    startTransition(async () => {
      try {
        await actionUnmarkCadastralPayment({ id: target.id });
        toast.success("Pago desmarcado.");
        setUnmarkTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteCadastralPayment({ id: target.id });
        toast.success("Predial eliminado.");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar.");
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
              onValueChange={(v) => v && setYearParam(v)}
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
          <FilterField label="Dueña">
            <Select
              value={ownerFilter}
              onValueChange={(v) => v && setOwnerFilter(v)}
              items={ownerItems}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ownerItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Estado">
            <Select
              value={statusFilter}
              onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
              items={STATUS_FILTER_ITEMS}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_FILTER_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
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
            Nuevo predial
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total registrado" value={MXN.format(totals.total)} />
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
          label="Paga tercero"
          value={MXN.format(totals.thirdParty)}
          tone="muted"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inmueble</TableHead>
              <TableHead>Clave catastral</TableHead>
              <TableHead>Dueña</TableHead>
              <TableHead>Pagador</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-sm text-muted-foreground"
                >
                  Sin prediales que coincidan con los filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.propertyName}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.cadastralKey ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.ownerEntity.code}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{payerLabel(p)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.totalAmount !== null ? MXN.format(p.totalAmount) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {DATE.format(p.dueDate)}
                  </TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" />}
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Acciones</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && !p.isPaid ? (
                          <DropdownMenuItem
                            onClick={() => setPaymentTarget(p)}
                          >
                            <CheckCircle2 className="size-4" />
                            Registrar pago
                          </DropdownMenuItem>
                        ) : null}
                        {canUpdate && p.isPaid ? (
                          <DropdownMenuItem
                            onClick={() => setUnmarkTarget(p)}
                          >
                            <RotateCcw className="size-4" />
                            Desmarcar pago
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => setReceiptsTarget(p)}
                        >
                          <FileText className="size-4" />
                          Boletas
                        </DropdownMenuItem>
                        {canUpdate ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setFormInitial(p);
                              setFormMode("edit");
                            }}
                          >
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                        ) : null}
                        {canDelete ? (
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                            Eliminar
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PredialFormDialog
        mode={formMode}
        initial={formInitial}
        properties={properties}
        legalEntities={legalEntities}
        defaultYear={selectedYear}
        onClose={() => {
          setFormMode(null);
          setFormInitial(null);
        }}
      />

      <PredialRegisterPaymentDialog
        target={paymentTarget}
        onClose={() => setPaymentTarget(null)}
      />

      <PredialReceiptsDialog
        target={receiptsTarget}
        canEdit={canUpdate}
        onClose={() => setReceiptsTarget(null)}
      />

      <AlertDialog
        open={unmarkTarget !== null}
        onOpenChange={(o) => !o && !pending && setUnmarkTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desmarcar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              El predial volverá a estado pendiente y se borrarán el monto
              pagado y la fecha registrados. Las boletas adjuntas no se
              eliminan.
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
            <AlertDialogTitle>¿Eliminar predial?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el registro {deleteTarget?.year} de{" "}
              {deleteTarget?.propertyName}. Las boletas adjuntas también se
              eliminarán. Esta acción no se puede deshacer.
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
