"use client";

import { useTransition, useState, useEffect } from "react";
import { Link2, Link2Off, UserCheck, UserX, Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  actionCreatePromoterLink,
  actionDeactivatePromoterLink,
  actionTogglePromoterActive,
} from "@/lib/services/promoters";
import { createPromoterLinkSchema, type CreatePromoterLinkInput } from "@/lib/validators/promoter";
import type { PromoterRow, UnitForLink } from "@/lib/services/promoters-queries";
import { unitWithProperty } from "@/lib/i18n/unit-label";
import { formatMXN } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

function LinkDialog({ promoterId, units }: { promoterId: string; units: UnitForLink[] }) {
  const [open, setOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const form = useForm<CreatePromoterLinkInput>({
    resolver: zodResolver(createPromoterLinkSchema) as unknown as Resolver<CreatePromoterLinkInput>,
    defaultValues: { promoterId, unitId: "", expiresInDays: 30 },
  });

  // Para plazas mostramos el local específico; para inmuebles independientes
  // (oficina, casa, espectacular, etc.) basta con el nombre del inmueble.
  function formatUnitLabel(u: UnitForLink): string {
    const base = unitWithProperty(u);
    return u.estimatedRent ? `${base} — ${formatMXN(u.estimatedRent)}` : base;
  }

  const unitLabels = Object.fromEntries(units.map((u) => [u.id, formatUnitLabel(u)]));
  const expiresLabels = Object.fromEntries([7, 15, 30, 60, 90].map((d) => [String(d), `${d} días`]));

  async function onSubmit(values: CreatePromoterLinkInput) {
    try {
      const { publicToken } = await actionCreatePromoterLink(values);
      const url = `${window.location.origin}/p/${publicToken}`;
      setGeneratedLink(url);
      toast.success("Link generado.");
    } catch {
      toast.error("Error al generar el link.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setGeneratedLink(null); form.reset({ promoterId, unitId: "", expiresInDays: 30 }); } }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Link2 className="size-3.5" />
        Generar link
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generar link de local o inmueble</DialogTitle>
        </DialogHeader>
        {generatedLink ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Comparte este link con el promotor. Expira según configuración.
            </p>
            <div className="flex items-start gap-2 rounded-md border bg-muted px-3 py-2">
              <code className="min-w-0 flex-1 break-all text-xs">{generatedLink}</code>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success("Copiado."); }}
              >
                Copiar
              </Button>
            </div>
            <Button className="w-full" variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Local o inmueble</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} items={unitLabels}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona un local o inmueble" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {formatUnitLabel(u)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresInDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vigencia (días)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={String(field.value)}
                      items={expiresLabels}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {[7, 15, 30, 60, 90].map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} días
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Generando..." : "Generar link"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  promoters: PromoterRow[];
  units: UnitForLink[];
  canManage: boolean;
}

export function PromotersTable({ promoters, units, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  }

  // QR imprimible de la liga pública (para compartir o pegar en lonas físicas).
  // Import dinámico: mantiene la lib qrcode fuera del bundle inicial.
  async function downloadQr(url: string, token: string) {
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `qr-liga-${token.slice(0, 8)}.png`;
      a.click();
      toast.success("QR descargado.");
    } catch {
      toast.error("No se pudo generar el QR.");
    }
  }

  function toggleActive(promoterId: string, current: boolean) {
    startTransition(async () => {
      try {
        await actionTogglePromoterActive(promoterId, !current);
        toast.success(!current ? "Promotor activado." : "Promotor desactivado.");
      } catch { toast.error("Error al actualizar."); }
    });
  }

  function deactivateLink(linkId: string) {
    startTransition(async () => {
      try {
        await actionDeactivatePromoterLink(linkId);
        toast.success("Link desactivado.");
      } catch { toast.error("Error al desactivar link."); }
    });
  }

  if (promoters.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-muted-foreground">No hay promotores registrados.</p>
          {canManage && (
            <p className="text-sm text-muted-foreground">
              Usa el botón &ldquo;Registrar promotor&rdquo; para agregar el primero.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
      {promoters.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{p.fullName}</p>
                {!p.isActive && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    Inactivo
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {p.phone}
                {p.agency && ` · ${p.agency}`}
                {p.email && ` · ${p.email}`}
              </p>
            </div>
            {canManage && (
              <div className="flex shrink-0 gap-2">
                <LinkDialog promoterId={p.id} units={units} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleActive(p.id, p.isActive)}
                  className="text-muted-foreground"
                >
                  {p.isActive ? (
                    <><UserX className="size-3.5" /> Desactivar</>
                  ) : (
                    <><UserCheck className="size-3.5" /> Activar</>
                  )}
                </Button>
              </div>
            )}
          </CardHeader>

          {p.links.length > 0 && (
            <CardContent className="pt-0">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Links activos ({p.links.length})
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Local</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Visitas</TableHead>
                    <TableHead>¿Rentó?</TableHead>
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.links.map((l) => {
                    const url = origin ? `${origin}/p/${l.publicToken}` : `/p/${l.publicToken}`;
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">
                              {unitWithProperty(l.unit)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate font-mono text-xs text-blue-600 hover:underline"
                              >
                                {url}
                              </a>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-6 shrink-0 p-0 text-muted-foreground"
                                onClick={() => copyLink(url)}
                                title="Copiar link"
                              >
                                <Copy className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-6 shrink-0 p-0 text-muted-foreground"
                                onClick={() => downloadQr(url, l.publicToken)}
                                title="Descargar QR"
                              >
                                <QrCode className="size-3" />
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(l.expiresAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {l.visitCount}
                        </TableCell>
                        <TableCell>
                          {l.resultedInRent ? (
                            <span className="text-xs font-medium text-emerald-700">Sí</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => deactivateLink(l.id)}
                            >
                              <Link2Off className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
