"use client";

import { GripVertical, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UnitPhotoUploader } from "@/components/properties/UnitPhotoUploader";
import {
  actionDeleteUnitPhoto,
  actionReorderUnitPhotos,
} from "@/lib/services/unit-photos";

interface Photo {
  id: string;
  url: string;
  filename: string;
}

interface Props {
  unitId: string;
  photos: ReadonlyArray<Photo>;
}

const MIN_SLOTS = 4;

export function UnitPhotoGallery({ unitId, photos }: Props) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startReorderTransition] = useTransition();

  // Estado local para UI optimista en drag-and-drop. Re-sincroniza con props
  // tras router.refresh().
  const [localPhotos, setLocalPhotos] = useState<ReadonlyArray<Photo>>(photos);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    setLocalPhotos(photos);
  }, [photos]);

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteUnitPhoto({ documentId: target.id });
        toast.success("Foto eliminada.");
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al eliminar.";
        toast.error(msg);
      }
    });
  }

  function reorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const next = [...localPhotos];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    setLocalPhotos(next);

    const orderedIds = next.map((p) => p.id);
    startReorderTransition(async () => {
      try {
        await actionReorderUnitPhotos({ unitId, orderedIds });
        router.refresh();
      } catch (error) {
        setLocalPhotos(photos); // revert
        const msg = error instanceof Error ? error.message : "Error al reordenar.";
        toast.error(msg);
      }
    });
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, id: string) {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedId !== id) setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      const fromIdx = localPhotos.findIndex((p) => p.id === draggedId);
      const toIdx = localPhotos.findIndex((p) => p.id === targetId);
      reorder(fromIdx, toIdx);
    }
    setDraggedId(null);
    setDragOverId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  const emptySlots = Math.max(0, MIN_SLOTS - localPhotos.length);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {localPhotos.length === 0
          ? "Aún no hay fotos. Haz click en cualquier recuadro para subir."
          : `${localPhotos.length} foto${localPhotos.length === 1 ? "" : "s"}. Arrastra para reordenar — la primera es la portada.`}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {localPhotos.map((photo, idx) => {
          const isCover = idx === 0;
          const isDragged = draggedId === photo.id;
          const isOver = dragOverId === photo.id;
          return (
            <div
              key={photo.id}
              draggable
              onDragStart={(e) => handleDragStart(e, photo.id)}
              onDragOver={(e) => handleDragOver(e, photo.id)}
              onDrop={(e) => handleDrop(e, photo.id)}
              onDragEnd={handleDragEnd}
              className={`group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-muted transition active:cursor-grabbing ${
                isDragged ? "opacity-40" : ""
              } ${isOver ? "ring-2 ring-primary ring-offset-2" : ""}`}
            >
              <button
                type="button"
                onClick={() => setPreviewUrl(photo.url)}
                className="absolute inset-0"
                aria-label={`Ver ${photo.filename}`}
              >
                <Image
                  src={photo.url}
                  alt=""
                  aria-hidden
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="scale-110 object-cover blur-xl"
                />
                <div className="absolute inset-0 bg-background/30" />
                <Image
                  src={photo.url}
                  alt={photo.filename}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="pointer-events-none object-contain transition-transform group-hover:scale-105"
                />
              </button>
              {isCover ? (
                <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow">
                  <Star className="size-3.5 fill-current" />
                  Portada
                </span>
              ) : null}
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/90 p-1.5 opacity-0 shadow transition-opacity group-hover:opacity-100"
                title="Arrastra para reordenar"
              >
                <GripVertical className="size-4 text-muted-foreground" />
              </span>
              <button
                type="button"
                onClick={() => setDeleteTarget(photo)}
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 opacity-0 shadow transition-opacity hover:bg-background group-hover:opacity-100"
                aria-label={`Eliminar ${photo.filename}`}
              >
                <Trash2 className="size-4 text-destructive" />
              </button>
            </div>
          );
        })}

        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            type="button"
            onClick={() => setUploadOpen(true)}
            aria-label="Subir foto"
            className="group flex aspect-square items-center justify-center rounded-lg border border-dashed bg-muted/40 transition-colors hover:border-primary/50 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ImagePlus className="size-10 text-muted-foreground/40 transition-colors group-hover:text-primary/70" />
          </button>
        ))}
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Subir fotos del local</DialogTitle>
            <DialogDescription>
              Las imágenes se guardan en almacenamiento seguro y se asocian al local.
            </DialogDescription>
          </DialogHeader>
          <UnitPhotoUploader
            unitId={unitId}
            onUploaded={() => {
              setUploadOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewUrl !== null}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="w-fit max-h-none max-w-none gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Vista previa</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <div
              className="flex h-[96vh] w-[98vw] cursor-zoom-out items-center justify-center"
              onClick={() => setPreviewUrl(null)}
            >
              <Image
                src={previewUrl}
                alt="Vista previa"
                width={3840}
                height={2160}
                sizes="98vw"
                className="h-auto max-h-[96vh] w-auto max-w-[98vw] cursor-default rounded-md object-contain"
                style={{ width: "auto", height: "auto" }}
                priority
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !pending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará &quot;{deleteTarget?.filename}&quot; del local. Esta acción
              no se puede deshacer.
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
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
