"use client";

import {
  Camera,
  CircleDot,
  FileText,
  ImageOff,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { PropertyPhotoGallery } from "@/components/properties/PropertyPhotoGallery";
import { usePropertiesViewMode } from "@/hooks/use-properties-view-mode";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import type { PropertiesViewMode } from "@/lib/properties-view-mode";
import { actionDeleteProperty } from "@/lib/services/properties";
import type {
  LegalEntityOption,
  PropertyListItem,
} from "@/lib/services/properties-queries";
import type { PropertyType } from "@/generated/prisma/enums";
import { formatMXN } from "@/lib/format-currency";

const INMUEBLE_TYPES: ReadonlyArray<PropertyType> = [
  "TERRENO_RENTADO",
  "EDIFICIO",
  "OFICINA",
  "CASA",
  "BODEGA",
  "ESPECTACULAR",
  "OTRO",
];

interface InmueblesTableProps {
  inmuebles: ReadonlyArray<PropertyListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  initialView: PropertiesViewMode;
}

export function InmueblesTable({
  inmuebles,
  legalEntities,
  initialView,
}: InmueblesTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PropertyListItem | null>(null);
  const [editTarget, setEditTarget] = useState<PropertyListItem | null>(null);
  const [photosTarget, setPhotosTarget] = useState<PropertyListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyListItem | null>(null);
  const [view, setView] = usePropertiesViewMode(initialView);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  // Re-sincronizar los targets abiertos cuando llega data fresca del servidor
  // (ej. tras reordenar fotos). Sin esto, el snapshot guardado queda atrás.
  useEffect(() => {
    if (photosTarget) {
      const fresh = inmuebles.find((p) => p.id === photosTarget.id);
      if (fresh && fresh !== photosTarget) setPhotosTarget(fresh);
    }
    if (detailTarget) {
      const fresh = inmuebles.find((p) => p.id === detailTarget.id);
      if (fresh && fresh !== detailTarget) setDetailTarget(fresh);
    }
  }, [inmuebles, photosTarget, detailTarget]);

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
              <List className="size-4" />
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
              onDetail={() => setDetailTarget(p)}
            />
          ))}
        </div>
      ) : (
        <InmueblesTableView
          inmuebles={filtered}
          onDetail={(p) => setDetailTarget(p)}
        />
      )}

      <InmuebleDetailDialog
        inmueble={detailTarget}
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
                <DialogTitle>Editar inmueble</DialogTitle>
                <DialogDescription>
                  Modifica la información de {editTarget.name}.
                </DialogDescription>
              </DialogHeader>
              <PropertyForm
                legalEntities={legalEntities}
                excludedTypes={["PLAZA_COMERCIAL"]}
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
                    Eliminar inmueble
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
              Sube imágenes para el inmueble. La más reciente aparecerá como portada.
            </DialogDescription>
          </DialogHeader>
          {photosTarget ? (
            <PropertyPhotoGallery
              propertyId={photosTarget.id}
              photos={photosTarget.photos ?? []}
              canEdit
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
  estimatedRent: number | null;
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
    estimatedRent: unit?.estimatedRent != null ? Number(unit.estimatedRent) : null,
  };
}

function InmuebleCard({
  inmueble,
  onDetail,
}: {
  inmueble: PropertyListItem;
  onDetail: () => void;
}) {
  const { coverPhotoUrl, name, address, type, ownerEntity, managerEntity, status } =
    inmueble;
  const isBlocked = status === "BLOQUEADO";
  const snap = inmuebleSnapshot(inmueble);
  const isAvailable = !isBlocked && snap.lesseeName === null;

  return (
    <Card
      className={
        "group flex h-full flex-col overflow-hidden p-0 " +
        (isAvailable
          ? "ring-1 ring-emerald-200 dark:ring-emerald-900/60"
          : "")
      }
    >
      <button
        type="button"
        onClick={onDetail}
        aria-label={`Ver detalle de ${name}`}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div
          className={
            "relative aspect-[4/3] w-full overflow-hidden " +
            (isAvailable
              ? "bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-teal-50 dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-teal-950/30"
              : "bg-muted")
          }
        >
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
          ) : isAvailable ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Sparkles className="size-8" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Listo para rentar
              </span>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-8" />
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="shadow-sm">
              {propertyTypeLabel(type)}
            </Badge>
            {isAvailable ? (
              <Badge className="border-transparent bg-emerald-500 text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-600">
                <CircleDot className="size-3" />
                Disponible
              </Badge>
            ) : null}
          </div>
        </div>
      </button>
      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
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

        {isBlocked ? null : (
        <div className="mt-auto space-y-1.5 border-t pt-2 text-sm">
          {snap.lesseeName ? (
            <>
              <p className="truncate font-medium">{snap.lesseeName}</p>
              {snap.monthly !== null ? (
                <p className="tabular-nums text-sm">
                  {formatMXN(snap.monthly)}
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
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <p className="font-medium text-emerald-700 dark:text-emerald-400">
                  Disponible para renta
                </p>
              </div>
              {snap.estimatedRent !== null ? (
                <p className="tabular-nums text-sm">
                  {formatMXN(snap.estimatedRent)}
                  <span className="text-xs text-muted-foreground"> / mes estimado</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin renta estimada definida.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onDetail}
                className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <Plus className="size-4" />
                Asignar inquilino
              </Button>
            </>
          )}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

const INMUEBLE_GRID_COLS =
  "minmax(0, 2fr) minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1.3fr) minmax(0, 1fr)";

function InmueblesTableView({
  inmuebles,
  onDetail,
}: {
  inmuebles: ReadonlyArray<PropertyListItem>;
  onDetail: (p: PropertyListItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div role="table" aria-label="Inmuebles">
        <div
          role="row"
          className="grid items-center border-b bg-muted/30 text-xs font-medium uppercase text-muted-foreground"
          style={{ gridTemplateColumns: INMUEBLE_GRID_COLS }}
        >
          <div role="columnheader" className="px-3 py-2.5">
            Nombre
          </div>
          <div role="columnheader" className="px-3 py-2.5 text-center">
            Tipo
          </div>
          <div role="columnheader" className="px-3 py-2.5">
            Dueña
          </div>
          <div role="columnheader" className="px-3 py-2.5">
            Administra
          </div>
          <div role="columnheader" className="px-3 py-2.5">
            Inquilino
          </div>
          <div role="columnheader" className="px-3 py-2.5 text-right">
            Renta
          </div>
        </div>
        {inmuebles.map((p) => {
          const snap = inmuebleSnapshot(p);
          const isBlocked = p.status === "BLOQUEADO";
          return (
            <div
              key={p.id}
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
              style={{ gridTemplateColumns: INMUEBLE_GRID_COLS }}
            >
              <div role="cell" className="min-w-0 px-3 py-2.5">
                <p className="truncate font-medium">{p.name}</p>
                {p.address ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {p.address}
                  </p>
                ) : null}
              </div>
              <div role="cell" className="flex justify-center px-3 py-2.5">
                <Badge variant="secondary">{propertyTypeLabel(p.type)}</Badge>
              </div>
              <div role="cell" className="truncate px-3 py-2.5">
                {p.ownerEntity.code}
              </div>
              <div role="cell" className="truncate px-3 py-2.5">
                {p.managerEntity.code}
              </div>
              <div role="cell" className="truncate px-3 py-2.5">
                {isBlocked ? (
                  <span className="text-muted-foreground">—</span>
                ) : snap.lesseeName ? (
                  snap.lesseeId ? (
                    <Link
                      href={`/lessees/${snap.lesseeId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {snap.lesseeName}
                    </Link>
                  ) : (
                    snap.lesseeName
                  )
                ) : (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                  >
                    <CircleDot className="size-3" />
                    Disponible
                  </Badge>
                )}
              </div>
              <div
                role="cell"
                className="px-3 py-2.5 text-right font-mono tabular-nums"
              >
                {isBlocked ? (
                  <span className="text-muted-foreground">—</span>
                ) : snap.monthly !== null ? (
                  formatMXN(snap.monthly)
                ) : snap.estimatedRent !== null ? (
                  <span className="text-muted-foreground">
                    ~{formatMXN(snap.estimatedRent)}
                  </span>
                ) : (
                  "—"
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InmuebleDetailDialog({
  inmueble,
  onOpenChange,
  onEditClick,
  onPhotosClick,
}: {
  inmueble: PropertyListItem | null;
  onOpenChange: (open: boolean) => void;
  onEditClick: () => void;
  onPhotosClick: () => void;
}) {
  const snap = inmueble ? inmuebleSnapshot(inmueble) : null;
  const totalArea =
    inmueble && inmueble.totalArea !== null && inmueble.totalArea !== undefined
      ? Number(inmueble.totalArea)
      : null;
  const isBlocked = inmueble?.status === "BLOQUEADO";
  const isAvailable =
    inmueble && !isBlocked && snap !== null && snap.lesseeName === null;

  function handlePhotos() {
    onOpenChange(false);
    onPhotosClick();
  }

  function handleEdit() {
    onOpenChange(false);
    onEditClick();
  }

  return (
    <Dialog open={inmueble !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        {inmueble && snap ? (
          <>
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
              {inmueble.coverPhotoUrl ? (
                <>
                  <Image
                    src={inmueble.coverPhotoUrl}
                    alt=""
                    aria-hidden
                    fill
                    sizes="(max-width: 768px) 100vw, 640px"
                    className="scale-110 object-cover blur-xl"
                  />
                  <div className="absolute inset-0 bg-background/40" />
                  <Image
                    src={inmueble.coverPhotoUrl}
                    alt={inmueble.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 640px"
                    className="object-contain"
                  />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/60">
                  <ImageOff className="size-12" />
                  <span className="text-xs uppercase tracking-wider">
                    Sin foto
                  </span>
                </div>
              )}
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="shadow-sm">
                  {propertyTypeLabel(inmueble.type)}
                </Badge>
                {isAvailable ? (
                  <Badge className="border-transparent bg-emerald-500 text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-600">
                    <CircleDot className="size-3" />
                    Disponible
                  </Badge>
                ) : null}
              </div>
              <span className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-md bg-black/70 px-2.5 py-1 text-sm font-semibold text-white shadow-sm backdrop-blur-sm">
                {inmueble.name}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={handlePhotos}
                aria-label="Editar fotos del inmueble"
                className="absolute bottom-3 right-3 size-9 rounded-full shadow-md"
              >
                <Camera className="size-4" />
              </Button>
            </div>

            <div className="max-h-[60vh] space-y-5 overflow-y-auto p-6">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-xl">{inmueble.name}</DialogTitle>
                <DialogDescription>
                  Información detallada del inmueble.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InmuebleDetailField
                  label="Tipo"
                  value={propertyTypeLabel(inmueble.type)}
                />
                <InmuebleDetailField
                  label="Dueña"
                  value={inmueble.ownerEntity.code}
                />
                <InmuebleDetailField
                  label="Administra"
                  value={inmueble.managerEntity.code}
                />
                {totalArea !== null ? (
                  <InmuebleDetailField
                    label="Área total"
                    value={`${totalArea} m²`}
                  />
                ) : null}
                {inmueble.cadastralKey ? (
                  <InmuebleDetailField
                    label="Clave catastral"
                    value={inmueble.cadastralKey}
                    mono
                  />
                ) : null}
                {!isBlocked && snap.monthly !== null ? (
                  <InmuebleDetailField
                    label="Renta mensual"
                    value={formatMXN(snap.monthly)}
                    emphasis
                  />
                ) : !isBlocked && snap.estimatedRent !== null ? (
                  <InmuebleDetailField
                    label="Renta estimada"
                    value={formatMXN(snap.estimatedRent)}
                  />
                ) : null}
              </div>

              {!isBlocked && (snap.lesseeName || snap.contractId) ? (
                <div className="rounded-md border bg-muted/30 p-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Inquilino activo
                  </p>
                  <div className="space-y-2 text-sm">
                    {snap.lesseeName ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Nombre</span>
                        {snap.lesseeId ? (
                          <Link
                            href={`/lessees/${snap.lesseeId}`}
                            className="font-medium hover:underline"
                          >
                            {snap.lesseeName}
                          </Link>
                        ) : (
                          <span className="font-medium">{snap.lesseeName}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {inmueble.address ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Dirección
                  </p>
                  <p className="text-sm text-foreground/90">{inmueble.address}</p>
                </div>
              ) : null}

              {inmueble.notes ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Notas
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">
                    {inmueble.notes}
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 border-t pt-4">
                <Button onClick={handleEdit} size="sm" className="w-full">
                  <Pencil className="size-4" />
                  Editar
                </Button>
                {snap.contractId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    render={<Link href={`/contracts/${snap.contractId}`} />}
                  >
                    <FileText className="size-4" />
                    Ver contrato
                  </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
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

function InmuebleDetailField({
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
