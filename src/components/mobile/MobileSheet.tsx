"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/utils";

/**
 * Bottom sheet de Rex móvil. Compone el mismo primitivo de base-ui que usa
 * `ui/sheet.tsx` (focus trap, Escape, tap en overlay cierra), con el look del
 * handoff: overlay Midnight/40, radius 22 superior, grabber y entrada
 * translateY(100%) → 0 en .28s.
 */
export function MobileSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-[rgba(11,14,41,.4)] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <SheetPrimitive.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-lg flex-col gap-3.5 overflow-y-auto overscroll-contain",
            "rounded-t-[22px] bg-background px-4 pt-2 pb-[calc(34px+env(safe-area-inset-bottom))] text-foreground outline-none",
            "transition-transform duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)] data-ending-style:translate-y-full data-starting-style:translate-y-full",
          )}
        >
          <div aria-hidden className="h-[5px] w-9 shrink-0 self-center rounded-[3px] bg-border" />
          <div className="px-1">
            <SheetPrimitive.Title className="font-heading text-[19px] font-bold">
              {title}
            </SheetPrimitive.Title>
            {description ? (
              <SheetPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">
                {description}
              </SheetPrimitive.Description>
            ) : null}
          </div>
          {children}
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

/** Toggle 46×28 del handoff (on = primary). */
export function MobileSwitch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2.5 px-3.5 py-2.5 text-left text-sm disabled:opacity-70"
    >
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-7 w-[46px] flex-none rounded-[14px] transition-colors duration-200",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-[left] duration-200",
            checked ? "left-5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** CTA principal de los sheets (alto 50, radius 12). */
export function MobileSheetCta({
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "h-[50px] w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
