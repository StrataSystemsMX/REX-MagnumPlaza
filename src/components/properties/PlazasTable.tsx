"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Images,
  ImageOff,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Table2,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
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
import { UnitCard } from "@/components/properties/UnitCard";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
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
              isExpanded={expanded.has(p.id)}
              onToggle={() => toggleExpanded(p.id)}
              onEdit={() => setEditTarget(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      ) : (
        <PlazasTableView
          plazas={plazas}
          expanded={expanded}
          onToggle={toggleExpanded}
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
                status: editTarget.status,
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
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  plaza: PropertyListItem;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { coverPhotoUrl, name, address, ownerEntity, managerEntity, unitCounts } =
    plaza;
  const occupancyPct =
    unitCounts.total > 0 ? Math.round((unitCounts.rented / unitCounts.total) * 100) : 0;
  const activeUnits = plaza.units.filter((u) => u.isActive);

  return (
    <Card
      className={`group flex h-full flex-col overflow-hidden p-0 transition-shadow ${
        isExpanded
          ? "sm:col-span-2 lg:col-span-3 xl:col-span-4 shadow-lg ring-2 ring-primary/30"
          : ""
      }`}
    >
      <div className={isExpanded ? "flex flex-col gap-0 sm:flex-row" : ""}>
        <Link
          href={`/properties/${plaza.id}`}
          className={`block ${isExpanded ? "sm:w-1/3 sm:max-w-sm" : ""}`}
        >
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {coverPhotoUrl ? (
              <>
                <Image
                  src={coverPhotoUrl}
                  alt=""
                  aria-hidden
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="scale-110 object-cover blur-xl"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-background/30" />
                <Image
                  src={coverPhotoUrl}
                  alt={name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-contain transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-8" />
              </div>
            )}
          </div>
        </Link>
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                variant={isExpanded ? "secondary" : "outline"}
                size="sm"
                onClick={onToggle}
                aria-label={isExpanded ? "Colapsar locales" : "Ver locales"}
                aria-expanded={isExpanded}
                className={`shrink-0 gap-1 ${
                  isExpanded ? "" : "border-primary/50 text-primary hover:bg-primary/10"
                }`}
              >
                {isExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <span className="text-xs font-medium">
                  {isExpanded ? "Cerrar" : `Locales (${unitCounts.total})`}
                </span>
              </Button>
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
        </CardContent>
      </div>

      {isExpanded ? (
        <>
          <div className="border-t bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Locales de {name}
          </div>
          <div className="bg-muted/30 p-4">
            {activeUnits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esta plaza aún no tiene locales activos.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {activeUnits.map((u) => (
                  <UnitCard key={u.id} unit={u} propertyId={plaza.id} />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-muted/50 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              Fin de los locales de{" "}
              <span className="font-medium text-foreground">{name}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={onToggle} className="gap-1">
              <ChevronUp className="size-4" />
              Cerrar
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function PlazasTableView({
  plazas,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  plazas: ReadonlyArray<PropertyListItem>;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onEdit: (p: PropertyListItem) => void;
  onDelete: (p: PropertyListItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
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
            const isExpanded = expanded.has(p.id);
            const activeUnits = p.units.filter((u) => u.isActive);
            return (
              <Fragment key={p.id}>
                <TableRow data-state={isExpanded ? "expanded" : undefined}>
                  <TableCell className="w-8 p-0 pl-2 align-middle">
                    <Button
                      variant={isExpanded ? "secondary" : "outline"}
                      size="icon-sm"
                      onClick={() => onToggle(p.id)}
                      aria-label={isExpanded ? "Colapsar locales" : "Ver locales"}
                      aria-expanded={isExpanded}
                      className={
                        isExpanded ? "" : "border-primary/50 text-primary hover:bg-primary/10"
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-5" />
                      ) : (
                        <ChevronRight className="size-5" />
                      )}
                    </Button>
                  </TableCell>
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
                {isExpanded ? (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell />
                    <TableCell colSpan={6} className="p-0">
                      <div className="border-t border-b-2 border-b-primary/30">
                        <div className="bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Locales de {p.name}
                        </div>
                        <div className="p-4">
                          {activeUnits.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Esta plaza aún no tiene locales activos.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              {activeUnits.map((u) => (
                                <UnitCard key={u.id} unit={u} propertyId={p.id} />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t bg-muted/50 px-4 py-2.5">
                          <span className="text-xs text-muted-foreground">
                            Fin de los locales de{" "}
                            <span className="font-medium text-foreground">{p.name}</span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggle(p.id)}
                            className="gap-1"
                          >
                            <ChevronUp className="size-4" />
                            Cerrar
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
