"use client";

import { Camera, HandCoins, Loader2, TriangleAlert, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { ExpenseSheetForm } from "@/components/mobile/ExpenseSheetForm";
import { MaintenanceSheetForm } from "@/components/mobile/MaintenanceSheetForm";
import { MobileCard } from "@/components/mobile/MobileUI";
import { MobileSheet, MobileSheetCta } from "@/components/mobile/MobileSheet";
import { PaymentSheetForm } from "@/components/mobile/PaymentSheetForm";
import { formatMXN } from "@/shared/format-currency";
import {
  actionGetMobileCaptureOptions,
  type MobileCaptureOptions,
} from "@/server/services/mobile-actions";
import type { MobileRent } from "@/server/services/mobile-queries";
import { actionSendRentReminderManual } from "@/server/services/notifications-actions";
import type { ReminderLevel } from "@/server/pdf/template-config";

export interface ReminderTarget {
  rentId: string;
  level: ReminderLevel;
  lesseeName: string;
  whatsapp: string | null;
  balance: number;
}

export interface MobilePermissions {
  canRegisterPayment: boolean;
  canCreateExpense: boolean;
  canCreateMaintenance: boolean;
}

type Flow =
  | { kind: "quick" }
  | { kind: "pickRent" }
  | { kind: "pay"; rent: MobileRent }
  | { kind: "expense" }
  | { kind: "maintenance" }
  | { kind: "confirm3m"; target: ReminderTarget };

interface MobileCaptureContextValue extends MobilePermissions {
  /** Perfil Administrador: puede capturar algo (pago, egreso o mantenimiento). */
  canCapture: boolean;
  openQuick: () => void;
  openPayment: (rent: MobileRent) => void;
  /** 1M/2M se mandan directo; 3M abre confirmación (nunca automático). */
  sendReminder: (target: ReminderTarget) => void;
  sendingRentId: string | null;
}

const MobileCaptureContext = createContext<MobileCaptureContextValue | null>(null);

export function useMobileCapture(): MobileCaptureContextValue {
  const ctx = useContext(MobileCaptureContext);
  if (!ctx) throw new Error("useMobileCapture debe usarse dentro de <MobileCaptureProvider>.");
  return ctx;
}

export function MobileCaptureProvider({
  permissions,
  children,
}: {
  permissions: MobilePermissions;
  children: ReactNode;
}) {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MobileCaptureOptions | null>(null);
  const [loadingOptions, startLoadingOptions] = useTransition();
  const [sendingRentId, setSendingRentId] = useState<string | null>(null);

  const canCapture =
    permissions.canRegisterPayment || permissions.canCreateExpense || permissions.canCreateMaintenance;

  const ensureOptions = useCallback(() => {
    if (options) return;
    startLoadingOptions(async () => {
      try {
        setOptions(await actionGetMobileCaptureOptions());
      } catch (e) {
        console.error("[mobile] capture options failed", e);
        toast.error("No se pudieron cargar los datos de captura.");
      }
    });
  }, [options]);

  const show = useCallback(
    (next: Flow) => {
      if (next.kind !== "confirm3m") ensureOptions();
      setFlow(next);
      setOpen(true);
    },
    [ensureOptions],
  );

  const close = useCallback(() => setOpen(false), []);

  /** Tras una mutación: cierra, invalida opciones (saldos cambiaron) y refresca KPIs/badges. */
  const onDone = useCallback(() => {
    setOpen(false);
    setOptions(null);
    router.refresh();
  }, [router]);

  const dispatchReminder = useCallback(
    async (target: ReminderTarget) => {
      if (!target.whatsapp) {
        toast.error(`${target.lesseeName} no tiene WhatsApp registrado.`);
        return;
      }
      // Abrimos la pestaña ANTES del await: Safari iOS bloquea window.open
      // fuera del gesto del usuario.
      const waWindow = window.open("", "_blank");
      setSendingRentId(target.rentId);
      try {
        const result = await actionSendRentReminderManual(target.rentId, target.level, {
          channel: "WHATSAPP",
          to: target.whatsapp,
        });
        if (!result.waUrl) {
          waWindow?.close();
          toast.error("No se pudo construir el link de WhatsApp.");
          return;
        }
        if (waWindow) waWindow.location.href = result.waUrl;
        else window.location.href = result.waUrl;
        toast.success(`Aviso ${target.level} listo en WhatsApp para ${target.lesseeName}.`);
        router.refresh();
      } catch (e) {
        waWindow?.close();
        toast.error(e instanceof Error ? e.message : "Error al enviar el aviso.");
      } finally {
        setSendingRentId(null);
      }
    },
    [router],
  );

  const value = useMemo<MobileCaptureContextValue>(
    () => ({
      ...permissions,
      canCapture,
      openQuick: () => show({ kind: "quick" }),
      openPayment: (rent) => show({ kind: "pay", rent }),
      sendReminder: (target) => {
        if (target.level === "3M") show({ kind: "confirm3m", target });
        else void dispatchReminder(target);
      },
      sendingRentId,
    }),
    [permissions, canCapture, show, dispatchReminder, sendingRentId],
  );

  return (
    <MobileCaptureContext.Provider value={value}>
      {children}
      {flow ? (
        <MobileSheet
          open={open}
          onOpenChange={setOpen}
          title={sheetTitle(flow)}
          description={flow.kind === "pay" ? `${flow.rent.lesseeName} · ${flow.rent.unitCode}` : undefined}
        >
          {flow.kind === "quick" ? (
            <QuickMenu
              permissions={permissions}
              onPick={(kind) => show(kind === "pay" ? { kind: "pickRent" } : { kind })}
            />
          ) : flow.kind === "confirm3m" ? (
            <Confirm3M
              target={flow.target}
              sending={sendingRentId === flow.target.rentId}
              onCancel={close}
              onConfirm={async () => {
                await dispatchReminder(flow.target);
                close();
              }}
            />
          ) : !options ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {loadingOptions ? <Loader2 className="size-5 animate-spin" /> : "Sin datos."}
            </div>
          ) : flow.kind === "pickRent" ? (
            <PickRent rents={options.rents} onPick={(rent) => show({ kind: "pay", rent })} />
          ) : flow.kind === "pay" ? (
            <PaymentSheetForm
              key={flow.rent.rentId}
              rent={flow.rent}
              autoSendConfirmation={options.autoSendPaymentConfirmations}
              onDone={onDone}
            />
          ) : flow.kind === "expense" ? (
            <ExpenseSheetForm options={options} onDone={onDone} />
          ) : (
            <MaintenanceSheetForm properties={options.properties} onDone={onDone} />
          )}
        </MobileSheet>
      ) : null}
    </MobileCaptureContext.Provider>
  );
}

function sheetTitle(flow: Flow): string {
  switch (flow.kind) {
    case "quick":
      return "Capturar";
    case "pickRent":
      return "¿A qué renta?";
    case "pay":
      return "Registrar pago";
    case "expense":
      return "Capturar egreso";
    case "maintenance":
      return "Reportar mantenimiento";
    case "confirm3m":
      return "Enviar aviso de desalojo";
  }
}

function QuickMenu({
  permissions,
  onPick,
}: {
  permissions: MobilePermissions;
  onPick: (kind: "pay" | "expense" | "maintenance") => void;
}) {
  const items = [
    permissions.canRegisterPayment && {
      kind: "pay" as const,
      icon: HandCoins,
      title: "Registrar pago",
      sub: "Aplicar a una renta del mes",
      primary: true,
    },
    permissions.canCreateExpense && {
      kind: "expense" as const,
      icon: Camera,
      title: "Capturar egreso",
      sub: "Con foto del comprobante",
      primary: false,
    },
    permissions.canCreateMaintenance && {
      kind: "maintenance" as const,
      icon: Wrench,
      title: "Reportar mantenimiento",
      sub: "Correctivo o emergencia",
      primary: false,
    },
  ].filter((i) => i !== false);

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <button key={item.kind} type="button" onClick={() => onPick(item.kind)} className="text-left">
          <MobileCard className="flex items-center gap-3 p-3.5">
            <span
              className={
                item.primary
                  ? "flex size-10 items-center justify-center rounded-[10px] bg-primary text-primary-foreground"
                  : "flex size-10 items-center justify-center rounded-[10px] bg-secondary text-primary"
              }
            >
              <item.icon className="size-5" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold">{item.title}</span>
              <span className="block text-[12.5px] text-muted-foreground">{item.sub}</span>
            </span>
          </MobileCard>
        </button>
      ))}
    </div>
  );
}

function PickRent({ rents, onPick }: { rents: MobileRent[]; onPick: (rent: MobileRent) => void }) {
  if (rents.length === 0) {
    return (
      <MobileCard className="p-7 text-center text-[13px] text-muted-foreground">
        No hay rentas pendientes de cobro.
      </MobileCard>
    );
  }
  return (
    <MobileCard className="overflow-hidden">
      {rents.map((r) => (
        <button
          key={r.rentId}
          type="button"
          onClick={() => onPick(r)}
          className="flex w-full items-center gap-2.5 border-b border-muted px-3.5 py-[11px] text-left last:border-b-0 active:bg-background"
        >
          <span className="w-[34px] shrink-0 text-[13px] font-semibold text-primary">{r.unitCode}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{r.lesseeName}</span>
          <span className="text-[13.5px] font-semibold tabular-nums">{formatMXN(r.balance)}</span>
        </button>
      ))}
    </MobileCard>
  );
}

function Confirm3M({
  target,
  sending,
  onCancel,
  onConfirm,
}: {
  target: ReminderTarget;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex size-12 items-center justify-center self-center rounded-full bg-red-100 text-red-600">
        <TriangleAlert className="size-6" />
      </div>
      <p className="px-1 text-center text-sm leading-relaxed text-muted-foreground">
        Se enviará la plantilla <b className="font-semibold text-foreground">rent_reminder_3m_legal</b> a{" "}
        <b className="font-semibold text-foreground">{target.lesseeName}</b> por un adeudo de{" "}
        <b className="font-semibold text-foreground">{formatMXN(target.balance)}</b>. Esta acción queda
        registrada en el historial.
      </p>
      <MobileSheetCta className="bg-red-600 text-white" disabled={sending} onClick={() => void onConfirm()}>
        {sending ? <Loader2 className="mx-auto size-5 animate-spin" /> : "Sí, enviar aviso 3M"}
      </MobileSheetCta>
      <button
        type="button"
        onClick={onCancel}
        className="h-[46px] rounded-xl border border-border bg-card text-[15px] font-medium text-primary"
      >
        Cancelar
      </button>
    </div>
  );
}
