"use client";

import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  actionDeleteMaintenanceDocument,
  actionUploadMaintenanceDocument,
} from "@/lib/services/maintenance-documents";

export interface MaintenanceDocument {
  id: string;
  url: string;
  filename: string;
  mimeType: string | null;
}

interface MaintenanceAttachmentsProps {
  maintenanceId: string;
  documents: ReadonlyArray<MaintenanceDocument>;
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function MaintenanceAttachments({
  maintenanceId,
  documents,
}: MaintenanceAttachmentsProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("maintenanceId", maintenanceId);
      formData.set("file", file);
      await actionUploadMaintenanceDocument(formData);
      toast.success("Adjunto subido.");
      startTransition(() => router.refresh());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo subir el adjunto.";
      toast.error(message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDelete(documentId: string) {
    setDeletingId(documentId);
    startTransition(async () => {
      try {
        await actionDeleteMaintenanceDocument({ documentId });
        toast.success("Adjunto eliminado.");
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudo eliminar el adjunto.";
        toast.error(message);
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-4" />
          Adjuntos (fotos, vales, PDF)
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Subir
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin adjuntos. Sube fotos del trabajo o el vale/factura del proveedor.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((doc) => {
            const isImage = doc.mimeType?.startsWith("image/") ?? false;
            return (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-md border p-1.5 pr-2"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={doc.url}
                      alt={doc.filename}
                      className="size-9 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="truncate text-sm">{doc.filename}</span>
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === doc.id}
                  onClick={() => onDelete(doc.id)}
                  aria-label={`Eliminar ${doc.filename}`}
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
