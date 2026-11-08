"use client";

import {
  CircleDot,
  FileText,
  ImageOff,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { usePropertiesViewMode } from "@/hooks/use-properties-view-mode";
import { propertyTypeLabel } from "@/shared/i18n/enums";
import type { PropertiesViewMode } from "@/shared/properties-view-mode";
import { actionEnsureInmuebleUnit } from "@/server/services/units";
import type {
  LegalEntityOption,
  PropertyListItem,
} from "@/server/services/properties-queries";
import { formatMXN } from "@/shared/format-currency";

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
  const [showBlocked, setShowBlocked] = useState(false);
  const [view, setView] = usePropertiesViewMode(initialView);
  const [, startDetailTransition] = useTransition();

  // El detalle (y editar/fotos/eliminar) viven en /properties/[unitId] — si
  // el inmueble aún no tiene una unit (nunca se le asignó contrato), se crea
  // sobre la marcha, igual que ya hace "Asignar contrato".
  function handleDetail(p: PropertyListItem) {
    const snap = inmuebleSnapshot(p);
    if (snap.unitId) {
      router.push(`/properties/${snap.unitId}`);
      return;
    }
    startDetailTransition(async () => {
      try {
        const unitId = await actionEnsureInmuebleUnit(p.id);
        router.push(`/properties/${unitId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al abrir el detalle.");
      }
    });
  }

  const [search, setSearch] = useState("");

  // Las propiedades bloqueadas (solo administración) se ocultan por defecto;
  // un toggle las muestra cuando hay alguna.
  const blockedCount = inmuebles.filter((p) => p.status === "BLOQUEADO").length;
  const statusFiltered = showBlocked
    ? inmuebles
    : inmuebles.filter((p) => p.status !== "BLOQUEADO");

  const searchQ = search.trim().toLowerCase();
  const filtered = !searchQ
    ? statusFiltered
    : statusFiltered.filter((p) => {
        const unitFields = p.units.map((u) => `${u.code} ${u.name ?? ""}`).join(" ");
        const hay = `${p.name} ${p.address ?? ""} ${unitFields}`;
        return hay.toLowerCase().includes(searchQ);
      });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inmueble o dirección..."
              className="pl-8"
            />
          </div>
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
          {blockedCount > 0 ? (
            <Button
              variant={showBlocked ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowBlocked((v) => !v)}
              aria-pressed={showBlocked}
            >
              {showBlocked
                ? "Ocultar bloqueadas"
                : `Mostrar bloqueadas (${blockedCount})`}
            </Button>
          ) : null}
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Registrar inmueble
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar inmueble</DialogTitle>
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
              onDetail={() => handleDetail(p)}
            />
          ))}
        </div>
      ) : (
        <InmueblesTableView
          inmuebles={filtered}
          onDetail={handleDetail}
        />
      )}

    </>
  );
}

interface InmuebleSnapshot {
  unitId: string | null;
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
    unitId: unit?.id ?? null,
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
  const router = useRouter();
  const [assigning, startAssign] = useTransition();
  const { coverPhotoUrl, name, address, type, ownerEntity, managerEntity, status } =
    inmueble;
  const isBlocked = status === "BLOQUEADO";
  const snap = inmuebleSnapshot(inmueble);
  const isAvailable = !isBlocked && snap.lesseeName === null;

  function handleAsignarContrato() {
    startAssign(async () => {
      try {
        const unitId = await actionEnsureInmuebleUnit(inmueble.id);
        router.push(`/contracts?nuevo=1&unitId=${unitId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al preparar el contrato.");
      }
    });
  }

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
                disabled={assigning}
                onClick={handleAsignarContrato}
                className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <Plus className="size-4" />
                {assigning ? "Preparando..." : "Asignar contrato"}
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
  "minmax(150px, 2fr) minmax(100px, 0.9fr) minmax(55px, 0.8fr) minmax(55px, 0.8fr) minmax(120px, 1.3fr) minmax(80px, 1fr)";

function InmueblesTableView({
  inmuebles,
  onDetail,
}: {
  inmuebles: ReadonlyArray<PropertyListItem>;
  onDetail: (p: PropertyListItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="overflow-x-auto">
      <div role="table" aria-label="Inmuebles" className="min-w-[560px]">
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
              <div role="cell" className="overflow-hidden flex justify-center px-3 py-2.5">
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
                  snap.contractId ? (
                    <Link
                      href={`/contracts/${snap.contractId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {snap.lesseeName}
                    </Link>
                  ) : (
                    snap.lesseeName
                  )
                ) : (
                  <Link
                    href={`/contracts?nuevo=1${snap.unitId ? `&unitId=${snap.unitId}` : ""}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <Plus className="size-3" />
                    Asignar contrato
                  </Link>
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
    </div>
  );
}

