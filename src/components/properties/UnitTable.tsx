"use client";

import {
  ImageOff,
  Images,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Table2,
  Trash2,
  User,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UnitForm } from "@/components/forms/UnitForm";
import { PropertyThumbnail } from "@/components/properties/PropertyThumbnail";
import { UnitPhotoGallery } from "@/components/properties/UnitPhotoGallery";
import { unitStatusLabel, unitStatusVariant } from "@/lib/i18n/enums";
import { actionDeleteUnit } from "@/lib/services/units";
import type { UnitWithContract } from "@/lib/services/properties-queries";

interface UnitTableProps {
  propertyId: string;
  units: ReadonlyArray<UnitWithContract>;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export function UnitTable({ propertyId, units }: UnitTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UnitWithContract | null>(null);
  const [photosTarget, setPhotosTarget] = useState<UnitWithContract | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnitWithContract | null>(null);
  const [view, setView] = useState<"table" | "cards">("cards");
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteUnit(target.id);
        toast.success(`Unidad ${target.code} eliminada.`);
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {units.length} unidad{units.length === 1 ? "" : "es"} activa
            {units.length === 1 ? "" : "s"}.
          </p>
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
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" />
            Nueva Unidad
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nueva unidad</DialogTitle>
              <DialogDescription>
                Captura los datos de la unidad rentable.
              </DialogDescription>
            </DialogHeader>
            <UnitForm
              initial={{ propertyId, code: "", status: "DISPONIBLE" }}
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear unidad"
            />
          </DialogContent>
        </Dialog>
      </div>

      {units.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          Aún no hay unidades. Usa &quot;Nueva Unidad&quot; para agregarlas.
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {units.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              onEdit={() => setEditTarget(u)}
              onManagePhotos={() => setPhotosTarget(u)}
              onDelete={() => setDeleteTarget(u)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">
                  <span className="sr-only">Foto</span>
                </TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Área (m²)</TableHead>
                <TableHead className="text-right">Renta estimada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inquilino actual</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => {
                const contract = u.contracts[0] ?? null;
                const lessee = contract?.lessee ?? null;
                const cover = u.documents[0]?.url ?? null;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="py-2">
                      <PropertyThumbnail url={cover} alt={u.code} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{u.code}</TableCell>
                    <TableCell>{u.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.area !== null ? Number(u.area).toLocaleString("es-MX") : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.estimatedRent !== null
                        ? MXN.format(Number(u.estimatedRent))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={unitStatusVariant(u.status)}>
                        {unitStatusLabel(u.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lessee ? (
                        <div className="text-sm">
                          <Link
                            href={`/lessees/${lessee.id}`}
                            className="font-medium hover:underline"
                          >
                            {lessee.legalName}
                          </Link>
                          {lessee.contactName ? (
                            <p className="text-xs text-muted-foreground">
                              {lessee.contactName}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <UnitActionsMenu
                        onEdit={() => setEditTarget(u)}
                        onManagePhotos={() => setPhotosTarget(u)}
                        onDelete={() => setDeleteTarget(u)}
                        lesseeId={lessee?.id ?? null}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar unidad</DialogTitle>
            <DialogDescription>
              Modifica la información de la unidad {editTarget?.code}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <UnitForm
              initial={{
                id: editTarget.id,
                propertyId,
                code: editTarget.code,
                name: editTarget.name,
                area: editTarget.area,
                estimatedRent:
                  editTarget.estimatedRent !== null
                    ? Number(editTarget.estimatedRent)
                    : null,
                status: editTarget.status,
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

      <Dialog
        open={photosTarget !== null}
        onOpenChange={(open) => !open && setPhotosTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Fotos de la unidad {photosTarget?.code}
              {photosTarget?.name ? ` · ${photosTarget.name}` : null}
            </DialogTitle>
            <DialogDescription>
              Sube imágenes para esta unidad. La más reciente aparecerá como portada.
            </DialogDescription>
          </DialogHeader>
          {photosTarget ? (
            <UnitPhotoGallery
              unitId={photosTarget.id}
              photos={photosTarget.documents}
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
            <AlertDialogTitle>¿Eliminar unidad?</AlertDialogTitle>
            <AlertDialogDescription>
              La unidad {deleteTarget?.code} se marcará como inactiva. Los contratos y pagos
              históricos se conservan.
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

function UnitActionsMenu({
  onEdit,
  onManagePhotos,
  onDelete,
  lesseeId,
  size = "icon",
}: {
  onEdit: () => void;
  onManagePhotos: () => void;
  onDelete: () => void;
  lesseeId: string | null;
  size?: "icon" | "icon-sm";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={size} />}>
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
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onManagePhotos}>
          <Images className="size-4" />
          Fotos
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

function UnitCard({
  unit,
  onEdit,
  onManagePhotos,
  onDelete,
}: {
  unit: UnitWithContract;
  onEdit: () => void;
  onManagePhotos: () => void;
  onDelete: () => void;
}) {
  const contract = unit.contracts[0] ?? null;
  const lessee = contract?.lessee ?? null;
  const cover = unit.documents[0]?.url ?? null;
  const photoCount = unit.documents.length;
  const monthly = contract
    ? Number(contract.monthlyAmount)
    : unit.estimatedRent !== null
      ? Number(unit.estimatedRent)
      : null;

  return (
    <Card className="group flex h-full flex-col overflow-hidden p-0">
      <button
        type="button"
        onClick={onManagePhotos}
        className="relative block aspect-video w-full overflow-hidden bg-muted"
        aria-label={
          photoCount > 0
            ? `Ver fotos de ${unit.code}`
            : `Subir fotos de ${unit.code}`
        }
      >
        {cover ? (
          <Image
            src={cover}
            alt={unit.code}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="size-8" />
            <span className="text-xs">Sin fotos · click para subir</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant={unitStatusVariant(unit.status)} className="shadow-sm">
            {unitStatusLabel(unit.status)}
          </Badge>
        </div>
        {photoCount > 0 ? (
          <div className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium shadow">
            {photoCount} {photoCount === 1 ? "foto" : "fotos"}
          </div>
        ) : null}
      </button>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs text-muted-foreground">
              {unit.code}
            </p>
            <p className="truncate font-semibold">{unit.name ?? unit.code}</p>
          </div>
          <UnitActionsMenu
            onEdit={onEdit}
            onManagePhotos={onManagePhotos}
            onDelete={onDelete}
            lesseeId={lessee?.id ?? null}
            size="icon-sm"
          />
        </div>

        {unit.area !== null ? (
          <p className="text-xs text-muted-foreground">
            {Number(unit.area).toLocaleString("es-MX")} m²
          </p>
        ) : null}

        <div className="mt-auto space-y-2 border-t pt-3 text-sm">
          <div className="space-y-1">
            {lessee ? (
              <p className="truncate font-medium">{lessee.legalName}</p>
            ) : (
              <p className="text-muted-foreground">Disponible</p>
            )}
            {monthly !== null ? (
              <p className="tabular-nums">
                {MXN.format(monthly)}
                {!contract ? (
                  <span className="text-xs text-muted-foreground"> est.</span>
                ) : null}
              </p>
            ) : null}
          </div>
          {lessee ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              render={<Link href={`/lessees/${lessee.id}`} />}
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
