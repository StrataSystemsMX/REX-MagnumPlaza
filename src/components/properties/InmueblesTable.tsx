"use client";

import {
  ExternalLink,
  FileText,
  Images,
  ImageOff,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Table2,
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
import { propertyTypeLabel } from "@/lib/i18n/enums";
import { actionDeleteProperty } from "@/lib/services/properties";
import type {
  LegalEntityOption,
  PropertyListItem,
} from "@/lib/services/properties-queries";
import type { PropertyType } from "@/generated/prisma/enums";

const INMUEBLE_TYPES: ReadonlyArray<PropertyType> = [
  "TERRENO_RENTADO",
  "EDIFICIO",
  "OFICINA",
  "CASA",
  "BODEGA",
  "ESPECTACULAR",
  "OTRO",
];

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

interface InmueblesTableProps {
  inmuebles: ReadonlyArray<PropertyListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
}

export function InmueblesTable({ inmuebles, legalEntities }: InmueblesTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PropertyListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyListItem | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const presentTypes = useMemo(() => {
    const set = new Set<PropertyType>();
    for (const p of inmuebles) set.add(p.type);
    return set;
  }, [inmuebles]);

  const typeItems = useMemo<Record<string, string>>(
    () => ({
      all: "Todos los tipos",
      ...Object.fromEntries(
        INMUEBLE_TYPES.filter((t) => presentTypes.has(t)).map((t) => [
          t,
          propertyTypeLabel(t),
        ]),
      ),
    }),
    [presentTypes],
  );

  const filtered = useMemo(() => {
    return inmuebles.filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      return true;
    });
  }, [inmuebles, typeFilter]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? "all")}
            items={typeItems}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {INMUEBLE_TYPES.filter((t) => presentTypes.has(t)).map((t) => (
                <SelectItem key={t} value={t}>
                  {propertyTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border bg-background p-0.5">
            <Button
              variant={view === "cards" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setView("cards")}
              aria-label="Vista de cards"
              aria-pressed={view === "cards"}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setView("table")}
              aria-label="Vista de tabla"
              aria-pressed={view === "table"}
            >
              <Table2 className="size-4" />
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
                Captura los datos del inmueble. Si tiene un local rentable, lo agregas después en el detalle.
              </DialogDescription>
            </DialogHeader>
            <PropertyForm
              legalEntities={legalEntities}
              excludedTypes={["PLAZA_COMERCIAL"]}
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear inmueble"
            />
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay inmuebles para los filtros seleccionados.
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <InmuebleCard
              key={p.id}
              inmueble={p}
              onEdit={() => setEditTarget(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      ) : (
        <InmueblesTableView
          inmuebles={filtered}
          onEdit={(p) => setEditTarget(p)}
          onDelete={(p) => setDeleteTarget(p)}
        />
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar inmueble</DialogTitle>
            <DialogDescription>
              Modifica la información de {editTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <PropertyForm
              legalEntities={legalEntities}
              excludedTypes={["PLAZA_COMERCIAL"]}
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

interface InmuebleSnapshot {
  contractId: string | null;
  lesseeId: string | null;
  lesseeName: string | null;
  monthly: number | null;
}

function inmuebleSnapshot(p: PropertyListItem): InmuebleSnapshot {
  // Para inmuebles individuales típicamente hay 0 o 1 unit; tomamos la única con contrato activo si existe.
  const unit = p.units.find((u) => u.isActive && u.contracts[0]) ?? p.units.find((u) => u.isActive);
  const contract = unit?.contracts[0] ?? null;
  return {
    contractId: contract?.id ?? null,
    lesseeId: contract?.lessee.id ?? null,
    lesseeName: contract?.lessee.legalName ?? null,
    monthly: contract ? Number(contract.monthlyAmount) : null,
  };
}

function InmuebleActionsMenu({
  inmueble,
  onEdit,
  onDelete,
  size = "icon-sm",
}: {
  inmueble: PropertyListItem;
  onEdit: () => void;
  onDelete: () => void;
  size?: "icon" | "icon-sm";
}) {
  const snap = inmuebleSnapshot(inmueble);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={size} />}>
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Acciones</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/properties/${inmueble.id}`} />}>
          <ExternalLink className="size-4" />
          Ver detalle
        </DropdownMenuItem>
        {snap.contractId ? (
          <DropdownMenuItem render={<Link href={`/contracts/${snap.contractId}`} />}>
            <FileText className="size-4" />
            Ver contrato
          </DropdownMenuItem>
        ) : null}
        {snap.lesseeId ? (
          <DropdownMenuItem render={<Link href={`/lessees/${snap.lesseeId}`} />}>
            <User className="size-4" />
            Ver inquilino
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          render={<Link href={`/properties/${inmueble.id}?tab=photos`} />}
        >
          <Images className="size-4" />
          Fotos
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/prediales" />}>
          <Receipt className="size-4" />
          Ver predial
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" />
          Editar
        </DropdownMenuItem>
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

function InmuebleCard({
  inmueble,
  onEdit,
  onDelete,
}: {
  inmueble: PropertyListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { coverPhotoUrl, name, address, type, ownerEntity, managerEntity } = inmueble;
  const snap = inmuebleSnapshot(inmueble);

  return (
    <Card className="group flex h-full flex-col overflow-hidden p-0">
      <Link href={`/properties/${inmueble.id}`} className="block">
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
              href={`/properties/${inmueble.id}`}
              className="block truncate font-semibold hover:underline"
            >
              {name}
            </Link>
            {address ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">{address}</p>
            ) : null}
          </div>
          <InmuebleActionsMenu
            inmueble={inmueble}
            onEdit={onEdit}
            onDelete={onDelete}
          />
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

        <div className="mt-auto space-y-2 border-t pt-3 text-sm">
          {snap.lesseeName ? (
            <p className="truncate font-medium">{snap.lesseeName}</p>
          ) : (
            <p className="text-muted-foreground">Disponible</p>
          )}
          {snap.monthly !== null ? (
            <p className="tabular-nums text-sm">
              {MXN.format(snap.monthly)}
              <span className="text-xs text-muted-foreground"> / mes</span>
            </p>
          ) : null}
          {snap.lesseeId ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              render={<Link href={`/lessees/${snap.lesseeId}`} />}
            >
              <User className="size-4" />
              Ver inquilino
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function InmueblesTableView({
  inmuebles,
  onEdit,
  onDelete,
}: {
  inmuebles: ReadonlyArray<PropertyListItem>;
  onEdit: (p: PropertyListItem) => void;
  onDelete: (p: PropertyListItem) => void;
}) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Dueña</TableHead>
            <TableHead>Administra</TableHead>
            <TableHead>Inquilino</TableHead>
            <TableHead className="text-right">Renta</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inmuebles.map((p) => {
            const snap = inmuebleSnapshot(p);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/properties/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.address ? (
                    <p className="text-xs text-muted-foreground">{p.address}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{propertyTypeLabel(p.type)}</Badge>
                </TableCell>
                <TableCell className="text-sm">{p.ownerEntity.code}</TableCell>
                <TableCell className="text-sm">{p.managerEntity.code}</TableCell>
                <TableCell className="text-sm">
                  {snap.lesseeName ? (
                    snap.lesseeId ? (
                      <Link
                        href={`/lessees/${snap.lesseeId}`}
                        className="hover:underline"
                      >
                        {snap.lesseeName}
                      </Link>
                    ) : (
                      snap.lesseeName
                    )
                  ) : (
                    <span className="text-muted-foreground">Disponible</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {snap.monthly !== null ? MXN.format(snap.monthly) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <InmuebleActionsMenu
                    inmueble={p}
                    onEdit={() => onEdit(p)}
                    onDelete={() => onDelete(p)}
                    size="icon"
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
