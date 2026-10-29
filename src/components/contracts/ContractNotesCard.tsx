"use client";

import { Pencil, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionUpdateContract } from "@/server/services/contracts";

interface ContractNotesCardProps {
  contractId: string;
  notes: string | null;
}

export function ContractNotesCard({ contractId, notes }: ContractNotesCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraft(notes ?? "");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(notes ?? "");
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed === (notes ?? "").trim()) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await actionUpdateContract(contractId, { notes: trimmed });
        toast.success("Notas actualizadas.");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar notas.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Notas
        </h3>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={startEdit}
            className="h-7 gap-1 px-2 text-xs"
          >
            <Pencil className="size-3.5" />
            Editar
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Agrega notas sobre el contrato..."
            maxLength={2000}
            autoFocus
            disabled={pending}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {draft.length}/2000
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={pending}
              >
                <X className="size-3.5" />
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={pending}
              >
                <Check className="size-3.5" />
                {pending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      ) : notes ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{notes}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          Sin notas. Haz clic en &ldquo;Editar&rdquo; para agregar contexto sobre
          este contrato.
        </p>
      )}
    </div>
  );
}
