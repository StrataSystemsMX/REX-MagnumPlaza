"use client";

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Images,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { UnitForm } from "@/components/forms/UnitForm";
import { propertyTypeLabel, unitStatusLabel, unitStatusVariant } from "@/lib/i18n/enums";
import { actionDeleteUnit } from "@/lib/services/units";
import type {
  UnitsGroupedItem,
  UnitsGroupedUnit,
} from "@/lib/services/properties-queries";
import type { UnitStatus } from "@/generated/prisma/enums";

const UNIT_STATUSES: ReadonlyArray<UnitStatus> = [
  "DISPONIBLE",
  "APARTADA",
  "RENTADA",
  "EN_REMODELACION",
  "NO_DISPONIBLE",
];

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

interface GlobalUnitsTableProps {
  groups: ReadonlyArray<UnitsGroupedItem>;
}

interface UnitRow {
  unit: UnitsGroupedUnit;
  property: UnitsGroupedItem["property"];
}

export function GlobalUnitsTable({ groups }: GlobalUnitsTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [createPropertyId, setCreatePropertyId] = useState<string>("");

  const [editTarget, setEditTarget] = useState<UnitRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnitRow | null>(null);
  const [pending, startTransition] = useTransition();

  const propertyOptions = useMemo(
    () =>
      groups.map((g) => ({
        id: g.property.id,
        name: g.property.name,
        type: g.property.type,
      })),
    [groups],
  );

  const presentStatuses = useMemo(() => {
    const set = new Set<UnitStatus>();
    for (const g of groups) for (const u of g.units) set.add(u.status);
    return set;
  }, [groups]);

  const statusItems = useMemo<Record<string, string>>(
    () => ({
      all: "Todos los estados",
      ...Object.fromEntries(
        UNIT_STATUSES.filter((s) => presentStatuses.has(s)).map((s) => [
          s,
          unitStatusLabel(s),
        ]),
      ),
    }),
    [presentStatuses],
  );

  const propertyItems = useMemo<Record<string, string>>(
    () => ({
      all: "Todas las plazas e inmuebles",
      ...Object.fromEntries(propertyOptions.map((p) => [p.id, p.name])),
    }),
    [propertyOptions],
  );

  const createPropertyItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        propertyOptions.map((p) => [p.id, `${p.name} · ${propertyTypeLabel(p.type)}`]),
      ),
    [propertyOptions],
  );

  const filteredGroups = useMemo(() => {
    return groups
      .filter((g) => propertyFilter === "all" || g.property.id === propertyFilter)
      .map((g) => {
        const units = g.units.filter((u) => {
          if (statusFilter !== "all" && u.status !== statusFilter) return false;
          return true;
        });
        return { ...g, units };
      })
      .filter((g) => g.units.length > 0);
  }, [groups, statusFilter, propertyFilter]);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteUnit(target.unit.id);
        toast.success(`Local ${target.unit.code} eliminado.`);
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al eliminar.";
        toast.error(msg);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "all")}
            items={statusItems}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {UNIT_STATUSES.filter((s) => presentStatuses.has(s)).map((s) => (
                <SelectItem key={s} value={s}>
                  {unitStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={propertyFilter}
            onValueChange={(v) => setPropertyFilter(v ?? "all")}
            items={propertyItems}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Plaza / Inmueble" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las plazas e inmuebles</SelectItem>
              {propertyOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setCreatePropertyId("");
          }}
        >
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nuevo Local
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nuevo local</DialogTitle>
              <DialogDescription>
                {createPropertyId
                  ? "Captura los datos del local."
                  : "Selecciona la plaza o inmueble donde se ubicará el local."}
              </DialogDescription>
            </DialogHeader>
            {createPropertyId ? (
              <UnitForm
                initial={{
                  propertyId: createPropertyId,
                  code: "",
                  status: "DISPONIBLE",
                }}
                onSuccess={() => {
                  setCreateOpen(false);
                  setCreatePropertyId("");
                  router.refresh();
                }}
                submitLabel="Crear local"
              />
            ) : (
              <div className="space-y-4">
                <Select
                  value={createPropertyId}
                  onValueChange={(v) => setCreatePropertyId(v ?? "")}
                  items={createPropertyItems}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona plaza o inmueble" />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {propertyTypeLabel(p.type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancelar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay locales para los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const isCollapsed = collapsed.has(g.property.id);
            const rented = g.units.filter((u) => u.status === "RENTADA").length;
            return (
              <div key={g.property.id} className="rounded-md border bg-card">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.property.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{g.property.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {propertyTypeLabel(g.property.type)} ·{" "}
                      {g.property.ownerEntity.code}
                      {g.property.ownerEntity.id !== g.property.managerEntity.id ? (
                        <> / {g.property.managerEntity.code}</>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">{rented}</span> /{" "}
                    {g.units.length} ocupados
                  </span>
                </button>

                {!isCollapsed ? (
                  <UnitsSection
                    group={g}
                    onEdit={(u) => setEditTarget({ unit: u, property: g.property })}
                    onDelete={(u) =>
                      setDeleteTarget({ unit: u, property: g.property })
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar local</DialogTitle>
            <DialogDescription>
              Modifica la información de {editTarget?.unit.code}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <UnitForm
              initial={{
                id: editTarget.unit.id,
                propertyId: editTarget.unit.propertyId,
                code: editTarget.unit.code,
                name: editTarget.unit.name,
                area: editTarget.unit.area,
                estimatedRent:
                  editTarget.unit.estimatedRent !== null
                    ? Number(editTarget.unit.estimatedRent)
                    : null,
                status: editTarget.unit.status,
                notes: editTarget.unit.notes,
              }}
              onSuccess={() => {
                setEditTarget(null);
                router.refresh();
              }}
              submitLabel="Guardar cambios"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar local?</AlertDialogTitle>
            <AlertDialogDescription>
              El local {deleteTarget?.unit.code} se marcará como inactivo. Los contratos y
              pagos históricos se conservan.
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
              {pending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UnitsSection({
  group,
  onEdit,
  onDelete,
}: {
  group: UnitsGroupedItem;
  onEdit: (u: UnitsGroupedUnit) => void;
  onDelete: (u: UnitsGroupedUnit) => void;
}) {
  return (
    <div className="border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 w-14 pl-4">
              <span className="sr-only">Foto</span>
            </TableHead>
            <TableHead className="h-9">Código</TableHead>
            <TableHead className="h-9">Nombre</TableHead>
            <TableHead className="h-9 text-right">Área (m²)</TableHead>
            <TableHead className="h-9">Estado</TableHead>
            <TableHead className="h-9">Inquilino</TableHead>
            <TableHead className="h-9 text-right">Renta</TableHead>
            <TableHead className="h-9 w-10">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.units.map((u) => {
            const contract = u.contracts[0] ?? null;
            const lessee = contract?.lessee ?? null;
            const monthly = contract
              ? Number(contract.monthlyAmount)
              : u.estimatedRent !== null
                ? Number(u.estimatedRent)
                : null;
            return (
              <TableRow key={u.id}>
                <TableCell className="py-2 pl-4">
                  <Link
                    href={`/properties/${group.property.id}?tab=units`}
                    aria-label={
                      u.coverPhotoUrl
                        ? `Ver fotos de ${u.code}`
                        : `Subir fotos de ${u.code}`
                    }
                    className="relative block size-10 overflow-hidden rounded bg-muted"
                  >
                    {u.coverPhotoUrl ? (
                      <Image
                        src={u.coverPhotoUrl}
                        alt={u.code}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm">{u.code}</TableCell>
                <TableCell className="text-sm">
                  {u.name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {u.area !== null ? Number(u.area).toLocaleString("es-MX") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={unitStatusVariant(u.status)}>
                    {unitStatusLabel(u.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {lessee ? (
                    <Link
                      href={`/lessees/${lessee.id}`}
                      className="font-medium hover:underline"
                    >
                      {lessee.legalName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Disponible</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {monthly !== null ? (
                    <span className={contract ? "font-medium" : "text-muted-foreground"}>
                      {MXN.format(monthly)}
                      {!contract ? " est." : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <UnitActionsMenu
                    propertyId={group.property.id}
                    contractId={contract?.id ?? null}
                    lesseeId={lessee?.id ?? null}
                    onEdit={() => onEdit(u)}
                    onDelete={() => onDelete(u)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function UnitActionsMenu({
  propertyId,
  contractId,
  lesseeId,
  onEdit,
  onDelete,
}: {
  propertyId: string;
  contractId: string | null;
  lesseeId: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Acciones</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {lesseeId ? (
          <DropdownMenuItem render={<Link href={`/lessees/${lesseeId}`} />}>
            <User className="size-4" />
            Ver inquilino
          </DropdownMenuItem>
        ) : null}
        {contractId ? (
          <DropdownMenuItem render={<Link href={`/contracts/${contractId}`} />}>
            <FileText className="size-4" />
            Ver contrato
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          render={<Link href={`/properties/${propertyId}?tab=units`} />}
        >
          <ExternalLink className="size-4" />
          Ver plaza/inmueble
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={`/properties/${propertyId}?tab=units`} />}
        >
          <Images className="size-4" />
          Gestionar fotos
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
