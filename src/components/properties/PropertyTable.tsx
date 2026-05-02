"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ImageOff,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { PropertyForm } from "@/components/forms/PropertyForm";
import { PropertyThumbnail } from "@/components/properties/PropertyThumbnail";
import { propertyTypeLabel, unitStatusLabel, unitStatusVariant } from "@/lib/i18n/enums";
import { actionDeleteProperty } from "@/lib/services/properties";
import type { LegalEntityOption, PropertyListItem } from "@/lib/services/properties-queries";
import type { PropertyType } from "@/generated/prisma/enums";

const PROPERTY_TYPES: ReadonlyArray<PropertyType> = [
  "PLAZA_COMERCIAL",
  "TERRENO_RENTADO",
  "EDIFICIO",
  "OFICINA",
  "CASA",
  "BODEGA",
  "ESPECTACULAR",
  "OTRO",
];

const typeFilterItems: Record<string, string> = {
  all: "Todos los tipos",
  ...Object.fromEntries(PROPERTY_TYPES.map((t) => [t, propertyTypeLabel(t)])),
};

interface PropertyTableProps {
  properties: ReadonlyArray<PropertyListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function PropertyTable({ properties, legalEntities }: PropertyTableProps) {
  const router = useRouter();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PropertyListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyListItem | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"table" | "cards">("table");
  const [pending, startTransition] = useTransition();

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns = useMemo<ColumnDef<PropertyListItem>[]>(
    () => [
      {
        id: "photo",
        header: () => <span className="sr-only">Foto</span>,
        cell: ({ row }) => (
          <PropertyThumbnail
            url={row.original.coverPhotoUrl}
            alt={row.original.name}
          />
        ),
      },
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <div>
            <Link
              href={`/properties/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
            {row.original.address ? (
              <p className="text-xs text-muted-foreground">{row.original.address}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => (
          <Badge variant="secondary">{propertyTypeLabel(row.original.type)}</Badge>
        ),
        filterFn: (row, _id, value) =>
          value === "all" ? true : row.original.type === value,
      },
      {
        id: "owner",
        header: "Dueña",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.ownerEntity.code}</span>
        ),
      },
      {
        id: "manager",
        header: "Administra",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.managerEntity.code}</span>
        ),
      },
      {
        id: "units",
        header: "Unidades",
        cell: ({ row }) => {
          const c = row.original.unitCounts;
          return (
            <span className="text-sm tabular-nums">
              <span className="font-medium">{c.rented}</span>
              <span className="text-muted-foreground"> / {c.total}</span>
              {c.available > 0 ? (
                <span className="text-muted-foreground"> ({c.available} libres)</span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Acciones</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={`/properties/${row.original.id}`} />}>
                  <ExternalLink className="size-4" />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditTarget(row.original)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: properties as PropertyListItem[],
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const typeFilter = (table.getColumn("type")?.getFilterValue() as string | undefined) ?? "all";

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteProperty(target.id);
        toast.success(`Inmueble "${target.name}" eliminado.`);
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => table.getColumn("type")?.setFilterValue(v)}
            items={typeFilterItems}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(typeFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border bg-background p-0.5">
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setView("table")}
              aria-label="Vista de tabla"
              aria-pressed={view === "table"}
            >
              <Table2 className="size-4" />
            </Button>
            <Button
              variant={view === "cards" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setView("cards")}
              aria-label="Vista de cards"
              aria-pressed={view === "cards"}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nuevo Inmueble
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nuevo inmueble</DialogTitle>
              <DialogDescription>
                Captura los datos del inmueble. Las unidades se agregan después en el detalle.
              </DialogDescription>
            </DialogHeader>
            <PropertyForm
              legalEntities={legalEntities}
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear inmueble"
            />
          </DialogContent>
        </Dialog>
      </div>

      {view === "table" ? (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  <TableHead className="w-8" />
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No hay inmuebles para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const hasMultipleUnits = row.original.unitCounts.total > 1;
                  const isExpanded = expandedRows.has(row.original.id);
                  return (
                    <Fragment key={row.id}>
                      <TableRow data-state={isExpanded ? "expanded" : undefined}>
                        <TableCell className="w-8 p-0 pl-2 align-middle">
                          {hasMultipleUnits ? (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => toggleRow(row.original.id)}
                              aria-label={isExpanded ? "Colapsar unidades" : "Ver unidades"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          ) : null}
                        </TableCell>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                      {isExpanded ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={columns.length} className="p-0">
                            <UnitsSubtable units={row.original.units} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : table.getRowModel().rows.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay inmuebles para los filtros seleccionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {table.getRowModel().rows.map((row) => (
            <PropertyCard
              key={row.id}
              property={row.original}
              onEdit={() => setEditTarget(row.original)}
              onDelete={() => setDeleteTarget(row.original)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar inmueble</DialogTitle>
            <DialogDescription>
              Modifica la información del inmueble {editTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <PropertyForm
              legalEntities={legalEntities}
              initial={{
                id: editTarget.id,
                name: editTarget.name,
                type: editTarget.type,
                address: editTarget.address,
                ownerEntityId: editTarget.ownerEntity.id,
                managerEntityId: editTarget.managerEntity.id,
                cadastralKey: editTarget.cadastralKey,
                latitude: editTarget.latitude,
                longitude: editTarget.longitude,
                totalArea: editTarget.totalArea,
                notes: editTarget.notes,
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
            <AlertDialogTitle>¿Eliminar inmueble?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como inactivo &quot;{deleteTarget?.name}&quot;. Sus contratos y datos
              históricos se conservan; podrás restaurarlo después.
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

function PropertyCard({
  property,
  onEdit,
  onDelete,
}: {
  property: PropertyListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { coverPhotoUrl, name, address, type, ownerEntity, managerEntity, unitCounts } =
    property;
  const occupancyPct =
    unitCounts.total > 0 ? Math.round((unitCounts.rented / unitCounts.total) * 100) : 0;

  return (
    <Card className="group flex h-full flex-col overflow-hidden p-0">
      <Link href={`/properties/${property.id}`} className="block">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {coverPhotoUrl ? (
            <Image
              src={coverPhotoUrl}
              alt={name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-8" />
            </div>
          )}
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="shadow-sm">
              {propertyTypeLabel(type)}
            </Badge>
          </div>
        </div>
      </Link>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/properties/${property.id}`}
              className="block truncate font-semibold hover:underline"
            >
              {name}
            </Link>
            {address ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">{address}</p>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Acciones</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/properties/${property.id}`} />}>
                <ExternalLink className="size-4" />
                Ver detalle
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
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Dueña <span className="font-medium text-foreground">{ownerEntity.code}</span>
          </span>
          <span aria-hidden>·</span>
          <span>
            Administra{" "}
            <span className="font-medium text-foreground">{managerEntity.code}</span>
          </span>
        </div>

        <div className="mt-auto space-y-1.5 border-t pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium tabular-nums">
              {unitCounts.rented}
              <span className="text-muted-foreground"> / {unitCounts.total} ocupadas</span>
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {occupancyPct}%
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={occupancyPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
          {unitCounts.available > 0 ? (
            <p className="text-xs text-muted-foreground">
              {unitCounts.available} disponible
              {unitCounts.available === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function UnitsSubtable({ units }: { units: PropertyListItem["units"] }) {
  const activeUnits = units.filter((u) => u.isActive);
  if (activeUnits.length === 0) {
    return (
      <p className="px-6 py-3 text-xs text-muted-foreground">
        Este inmueble no tiene unidades activas.
      </p>
    );
  }

  return (
    <div className="border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 pl-6 text-xs">Código</TableHead>
            <TableHead className="h-8 text-xs">Nombre</TableHead>
            <TableHead className="h-8 text-xs">Estado</TableHead>
            <TableHead className="h-8 text-xs">Inquilino</TableHead>
            <TableHead className="h-8 text-right text-xs">Renta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeUnits.map((u) => {
            const activeContract = u.contracts[0];
            const monthly = activeContract
              ? Number(activeContract.monthlyAmount)
              : u.estimatedRent
                ? Number(u.estimatedRent)
                : null;
            return (
              <TableRow key={u.id} className="hover:bg-muted/40">
                <TableCell className="py-2 pl-6 font-mono text-xs">{u.code}</TableCell>
                <TableCell className="py-2 text-sm">
                  {u.name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-2">
                  <Badge variant={unitStatusVariant(u.status)}>
                    {unitStatusLabel(u.status)}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 text-sm">
                  {activeContract ? (
                    <Link
                      href={`/lessees/${activeContract.lessee.id}`}
                      className="hover:underline"
                    >
                      {activeContract.lessee.legalName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Disponible</span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums text-sm">
                  {monthly !== null ? (
                    <span className={activeContract ? "font-medium" : "text-muted-foreground"}>
                      {MXN.format(monthly)}
                      {!activeContract ? " est." : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
