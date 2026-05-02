"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actionUploadPropertyPhoto } from "@/lib/services/property-photos";
import {
  ALLOWED_PROPERTY_PHOTO_MIME_TYPES,
  MAX_PROPERTY_PHOTO_SIZE_BYTES,
  propertyPhotoFileSchema,
} from "@/lib/validators/document";
import { cn } from "@/lib/utils";

interface Props {
  propertyId: string;
  onUploaded?: () => void;
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string;
}

const ACCEPT = ALLOWED_PROPERTY_PHOTO_MIME_TYPES.join(",");

export function PropertyPhotoUploader({ propertyId, onUploaded }: Props) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      queue.forEach((q) => URL.revokeObjectURL(q.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const accepted: QueuedFile[] = [];
    for (const file of incoming) {
      const result = propertyPhotoFileSchema.safeParse(file);
      if (!result.success) {
        toast.error(`${file.name}: ${result.error.issues[0]?.message ?? "inválido"}`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (accepted.length > 0) setQueue((prev) => [...prev, ...accepted]);
  }

  function removeFromQueue(id: string) {
    setQueue((prev) => {
      const target = prev.find((q) => q.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function uploadAll() {
    if (queue.length === 0) return;
    const items = [...queue];
    startTransition(async () => {
      setProgress({ done: 0, total: items.length });
      let succeeded = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        try {
          const fd = new FormData();
          fd.set("propertyId", propertyId);
          fd.set("file", item.file);
          await actionUploadPropertyPhoto(fd);
          succeeded += 1;
          URL.revokeObjectURL(item.previewUrl);
          setQueue((prev) => prev.filter((q) => q.id !== item.id));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al subir.";
          toast.error(`${item.file.name}: ${msg}`);
          break;
        } finally {
          setProgress({ done: i + 1, total: items.length });
        }
      }
      setProgress(null);
      if (succeeded > 0) {
        toast.success(
          succeeded === 1
            ? "Foto subida."
            : `${succeeded} fotos subidas.`,
        );
        onUploaded?.();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-md border-2 border-dashed p-6 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-muted/30",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <ImagePlus className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 text-sm">
          Arrastra fotos aquí o{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => inputRef.current?.click()}
          >
            selecciona archivos
          </button>
          .
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          JPG, PNG o WebP. Máximo {MAX_PROPERTY_PHOTO_SIZE_BYTES / 1024 / 1024} MB
          por imagen.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={handleSelect}
        />
      </div>

      {queue.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {queue.map((q) => (
            <div
              key={q.id}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={q.previewUrl}
                alt={q.file.name}
                className="size-full object-cover"
              />
              {!pending ? (
                <button
                  type="button"
                  onClick={() => removeFromQueue(q.id)}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow"
                  aria-label={`Quitar ${q.file.name}`}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {progress
              ? `Subiendo ${progress.done} de ${progress.total}…`
              : `${queue.length} foto${queue.length === 1 ? "" : "s"} en cola.`}
          </span>
          <Button onClick={uploadAll} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Subir {queue.length} foto{queue.length === 1 ? "" : "s"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
