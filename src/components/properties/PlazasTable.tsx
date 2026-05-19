"use client";

import {
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ImageOff,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Receipt,
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
import { Badge } from "@/components/ui/badge";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { PropertyPhotoGallery } from "@/components/properties/PropertyPhotoGallery";
import {
  UNIT_GRID_COLS,
  UnitCard,
  UnitRow,
} from "@/components/properties/UnitCard";
import { usePropertiesViewMode } from "@/hooks/use-properties-view-mode";
import type { PropertiesViewMode } from "@/lib/properties-view-mode";
import { actionDeleteProperty } from "@/lib/services/properties";
import type {
  LegalEntityOption,
  PropertyListItem,
} from "@/lib/services/properties-queries";

interface PlazasTableProps {
  plazas: ReadonlyArray<PropertyListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  initialView: PropertiesViewMode;
}

export function PlazasTable({ plazas, legalEntities, initialView }: PlazasTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PropertyListItem | null>(null);
  const [editTarget, setEditTarget] = useState<PropertyListItem | null>(null);
  const [photosTarget, setPhotosTarget] = useState<PropertyListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyListItem | null>(null);
  const [view, setView] = usePropertiesViewMode(initialView);
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
              <List className="size-4" />
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
              onDetail={() => setDetailTarget(p)}
            />
          ))}
        </div>
      ) : (
        <PlazasTableView
          plazas={plazas}
          expanded={expanded}
          onToggle={toggleExpanded}
          onDetail={(p) => setDetailTarget(p)}
        />
      )}

      <PlazaDetailDialog
        plaza={detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        onEditClick={() => {
          const target = detailTarget;
          setDetailTarget(null);
          setEditTarget(target);
        }}
        onPhotosClick={() => {
          const target = detailTarget;
          setDetailTarget(null);
          setPhotosTarget(target);
        }}
      />

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            const target = editTarget;
            setEditTarget(null);
            setDetailTarget(target);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {editTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Editar plaza</DialogTitle>
                <DialogDescription>
                  Modifica la información de {editTarget.name}.
                </DialogDescription>
              </DialogHeader>
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
                  const target = editTarget;
                  setEditTarget(null);
                  setDetailTarget(target);
                  router.refresh();
                }}
                submitLabel="Guardar cambios"
                secondaryAction={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const target = editTarget;
                      setEditTarget(null);
                      setDeleteTarget(target);
                    }}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Eliminar plaza
                  </Button>
                }
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={photosTarget !== null}
        onOpenChange={(open) => !open && setPhotosTarget(null)}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Fotos de {photosTarget?.name}</DialogTitle>
            <DialogDescription>
              Sube imágenes para la plaza. La más reciente aparecerá como portada.
            </DialogDescription>
          </DialogHeader>
          {photosTarget ? (
            <PropertyPhotoGallery
              propertyId={photosTarget.id}
              photos={photosTarget.photos ?? []}
              canEdit
              isPlaza
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

function PlazaCard({
  plaza,
  isExpanded,
  onToggle,
  onDetail,
}: {
  plaza: PropertyListItem;
  isExpanded: boolean;
  onToggle: () => void;
  onDetail: () => void;
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
        <button
          type="button"
          onClick={onDetail}
          aria-label={`Ver detalle de ${name}`}
          className={`block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isExpanded ? "sm:w-1/3 sm:max-w-sm" : ""
          }`}
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
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
        </button>
        <CardContent className="flex flex-1 flex-col gap-2 p-3">
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
                <button
                  type="button"
                  onClick={onDetail}
                  className="block w-full truncate text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {name}
                </button>
                {address ? (
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{address}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              Dueña <span className="font-medium text-foreground">{ownerEntity.code}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              Administra{" "}
              <span className="font-medium text-foreground">{managerEntity.code}</span>
            </span>
          </div>

          <div className="mt-auto space-y-1.5 border-t pt-2">
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

const PLAZA_GRID_COLS =
  "40px minmax(0, 2fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 0.7fr)";

function PlazasTableView({
  plazas,
  expanded,
  onToggle,
  onDetail,
}: {
  plazas: ReadonlyArray<PropertyListItem>;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onDetail: (p: PropertyListItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div role="table" aria-label="Plazas">
        <div
          role="row"
          className="grid items-center border-b bg-muted/30 text-xs font-medium uppercase text-muted-foreground"
          style={{ gridTemplateColumns: PLAZA_GRID_COLS }}
        >
          <div role="columnheader" aria-label="Expandir" />
          <div role="columnheader" className="px-3 py-2.5">
            Nombre
          </div>
          <div role="columnheader" className="px-3 py-2.5">
            Dueña
          </div>
          <div role="columnheader" className="px-3 py-2.5">
            Administra
          </div>
          <div role="columnheader" className="px-3 py-2.5">
            Locales
          </div>
          <div role="columnheader" className="px-3 py-2.5 text-right">
            Ocupación
          </div>
        </div>
        {plazas.map((p) => {
          const occ =
            p.unitCounts.total > 0
              ? Math.round((p.unitCounts.rented / p.unitCounts.total) * 100)
              : 0;
          const isExpanded = expanded.has(p.id);
          const activeUnits = p.units.filter((u) => u.isActive);
          return (
            <Fragment key={p.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onDetail(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDetail(p);
                  }
                }}
                aria-label={`Ver detalle de ${p.name}`}
                className="grid cursor-pointer items-center border-b text-sm transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                style={{ gridTemplateColumns: PLAZA_GRID_COLS }}
                data-state={isExpanded ? "expanded" : undefined}
              >
                <div role="cell" className="flex justify-center">
                  <Button
                    variant={isExpanded ? "secondary" : "outline"}
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(p.id);
                    }}
                    aria-label={isExpanded ? "Colapsar locales" : "Ver locales"}
                    aria-expanded={isExpanded}
                    className={
                      isExpanded
                        ? ""
                        : "border-primary/50 text-primary hover:bg-primary/10"
                    }
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                </div>
                <div role="cell" className="min-w-0 px-3 py-2.5">
                  <p className="truncate font-medium">{p.name}</p>
                  {p.address ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {p.address}
                    </p>
                  ) : null}
                </div>
                <div role="cell" className="truncate px-3 py-2.5">
                  {p.ownerEntity.code}
                </div>
                <div role="cell" className="truncate px-3 py-2.5">
                  {p.managerEntity.code}
                </div>
                <div
                  role="cell"
                  className="px-3 py-2.5 font-mono tabular-nums"
                >
                  <span className="font-semibold">{p.unitCounts.rented}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {p.unitCounts.total}
                  </span>
                </div>
                <div
                  role="cell"
                  className="px-3 py-2.5 text-right font-mono tabular-nums"
                >
                  {occ}%
                </div>
              </div>
              {isExpanded ? (
                <div className="border-b bg-muted/30 px-4 py-3 last:border-b-0">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Locales de {p.name}
                  </div>
                  {activeUnits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Esta plaza aún no tiene locales activos.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-md border bg-card">
                      <div role="table" aria-label={`Locales de ${p.name}`}>
                        <div
                          role="row"
                          className="grid items-center border-b bg-muted/40 text-xs font-medium uppercase text-muted-foreground"
                          style={{ gridTemplateColumns: UNIT_GRID_COLS }}
                        >
                          <div role="columnheader" className="px-3 py-2">
                            Código
                          </div>
                          <div role="columnheader" className="px-3 py-2">
                            Estado
                          </div>
                          <div role="columnheader" className="px-3 py-2">
                            Inquilino
                          </div>
                          <div
                            role="columnheader"
                            className="px-3 py-2 text-right"
                          >
                            Renta
                          </div>
                        </div>
                        {activeUnits.map((u) => (
                          <UnitRow key={u.id} unit={u} propertyId={p.id} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function PlazaDetailDialog({
  plaza,
  onOpenChange,
  onEditClick,
  onPhotosClick,
}: {
  plaza: PropertyListItem | null;
  onOpenChange: (open: boolean) => void;
  onEditClick: () => void;
  onPhotosClick: () => void;
}) {
  const occupancyPct =
    plaza && plaza.unitCounts.total > 0
      ? Math.round((plaza.unitCounts.rented / plaza.unitCounts.total) * 100)
      : 0;
  const totalArea =
    plaza && plaza.totalArea !== null && plaza.totalArea !== undefined
      ? Number(plaza.totalArea)
      : null;

  function handlePhotos() {
    onOpenChange(false);
    onPhotosClick();
  }

  function handleEdit() {
    onOpenChange(false);
    onEditClick();
  }

  return (
    <Dialog open={plaza !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        {plaza ? (
        <>
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          {plaza.coverPhotoUrl ? (
            <>
              <Image
                src={plaza.coverPhotoUrl}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="scale-110 object-cover blur-xl"
              />
              <div className="absolute inset-0 bg-background/40" />
              <Image
                src={plaza.coverPhotoUrl}
                alt={plaza.name}
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain"
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/60">
              <ImageOff className="size-12" />
              <span className="text-xs uppercase tracking-wider">Sin foto</span>
            </div>
          )}
          <Badge variant="secondary" className="absolute left-3 top-3 shadow-sm">
            Plaza Comercial
          </Badge>
          <span className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-md bg-black/70 px-2.5 py-1 text-sm font-semibold text-white shadow-sm backdrop-blur-sm">
            {plaza.name}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            onClick={handlePhotos}
            aria-label="Editar fotos de la plaza"
            className="absolute bottom-3 right-3 size-9 rounded-full shadow-md"
          >
            <Camera className="size-4" />
          </Button>
        </div>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl">{plaza.name}</DialogTitle>
            <DialogDescription>
              Información detallada de la plaza.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <PlazaDetailField label="Dueña" value={plaza.ownerEntity.code} />
            <PlazaDetailField label="Administra" value={plaza.managerEntity.code} />
            <PlazaDetailField
              label="Locales"
              value={`${plaza.unitCounts.rented} / ${plaza.unitCounts.total}`}
            />
            <PlazaDetailField label="Ocupación" value={`${occupancyPct}%`} emphasis />
            {totalArea !== null ? (
              <PlazaDetailField label="Área total" value={`${totalArea} m²`} />
            ) : null}
            {plaza.cadastralKey ? (
              <PlazaDetailField label="Clave catastral" value={plaza.cadastralKey} mono />
            ) : null}
          </div>

          {plaza.address ? (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Dirección
              </p>
              <p className="text-sm text-foreground/90">{plaza.address}</p>
            </div>
          ) : null}

          {plaza.notes ? (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Notas
              </p>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">
                {plaza.notes}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={handleEdit} size="sm">
              <Pencil className="size-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/prediales" />}
            >
              <Receipt className="size-4" />
              Ver predial
            </Button>
          </div>
        </div>
        </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlazaDetailField({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={[
          mono ? "font-mono" : "",
          emphasis ? "font-bold text-foreground" : "font-medium",
          "text-sm",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
