"use client";

import {
  ExternalLink,
  Images,
  ImageOff,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Store,
  Table2,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { actionDeleteProperty } from "@/lib/services/properties";
import type {
  LegalEntityOption,
  PropertyListItem,
} from "@/lib/services/properties-queries";

interface PlazasTableProps {
  plazas: ReadonlyArray<PropertyListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
}

export function PlazasTable({ plazas, legalEntities }: PlazasTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PropertyListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyListItem | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteProperty(target.id);
        toast.success(`Plaza "${target.name}" eliminada.`);
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
            Nueva Plaza
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nueva plaza comercial</DialogTitle>
              <DialogDescription>
                Captura los datos de la plaza. Los locales se agregan después en el detalle.
              </DialogDescription>
            </DialogHeader>
            <PropertyForm
              legalEntities={legalEntities}
              lockedType="PLAZA_COMERCIAL"
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear plaza"
            />
          </DialogContent>
        </Dialog>
      </div>

      {plazas.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay plazas activas.
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plazas.map((p) => (
            <PlazaCard
              key={p.id}
              plaza={p}
              onEdit={() => setEditTarget(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      ) : (
        <PlazasTableView
          plazas={plazas}
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
            <DialogTitle>Editar plaza</DialogTitle>
            <DialogDescription>
              Modifica la información de {editTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <PropertyForm
              legalEntities={legalEntities}
              lockedType="PLAZA_COMERCIAL"
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
            <AlertDialogTitle>¿Eliminar plaza?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como inactiva &quot;{deleteTarget?.name}&quot;. Sus locales y contratos
              históricos se conservan; podrás restaurarla después.
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

function PlazaActionsMenu({
  plaza,
  onEdit,
  onDelete,
  size = "icon-sm",
}: {
  plaza: PropertyListItem;
  onEdit: () => void;
  onDelete: () => void;
  size?: "icon" | "icon-sm";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={size} />}>
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Acciones</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/properties/${plaza.id}`} />}>
          <ExternalLink className="size-4" />
          Ver detalle
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={`/properties/${plaza.id}?tab=units`} />}
        >
          <Store className="size-4" />
          Ver locales
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={`/properties/${plaza.id}?tab=photos`} />}
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

function PlazaCard({
  plaza,
  onEdit,
  onDelete,
}: {
  plaza: PropertyListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { coverPhotoUrl, name, address, ownerEntity, managerEntity, unitCounts } =
    plaza;
  const occupancyPct =
    unitCounts.total > 0 ? Math.round((unitCounts.rented / unitCounts.total) * 100) : 0;

  return (
    <Card className="group flex h-full flex-col overflow-hidden p-0">
      <Link href={`/properties/${plaza.id}`} className="block">
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
        </div>
      </Link>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/properties/${plaza.id}`}
              className="block truncate font-semibold hover:underline"
            >
              {name}
            </Link>
            {address ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">{address}</p>
            ) : null}
          </div>
          <PlazaActionsMenu plaza={plaza} onEdit={onEdit} onDelete={onDelete} />
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
              <span className="text-muted-foreground"> / {unitCounts.total} ocupados</span>
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

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          render={<Link href={`/properties/${plaza.id}?tab=units`} />}
        >
          <Store className="size-4" />
          Ver locales
        </Button>
      </CardContent>
    </Card>
  );
}

function PlazasTableView({
  plazas,
  onEdit,
  onDelete,
}: {
  plazas: ReadonlyArray<PropertyListItem>;
  onEdit: (p: PropertyListItem) => void;
  onDelete: (p: PropertyListItem) => void;
}) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Dueña</TableHead>
            <TableHead>Administra</TableHead>
            <TableHead>Locales</TableHead>
            <TableHead>Ocupación</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plazas.map((p) => {
            const occ =
              p.unitCounts.total > 0
                ? Math.round((p.unitCounts.rented / p.unitCounts.total) * 100)
                : 0;
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
                <TableCell className="text-sm">{p.ownerEntity.code}</TableCell>
                <TableCell className="text-sm">{p.managerEntity.code}</TableCell>
                <TableCell className="tabular-nums text-sm">
                  <span className="font-medium">{p.unitCounts.rented}</span>
                  <span className="text-muted-foreground"> / {p.unitCounts.total}</span>
                </TableCell>
                <TableCell className="tabular-nums text-sm">{occ}%</TableCell>
                <TableCell className="text-right">
                  <PlazaActionsMenu
                    plaza={p}
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
