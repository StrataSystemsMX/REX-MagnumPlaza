import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Building2 className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Rex</h1>
        <p className="text-sm text-muted-foreground">CRM Inmobiliario · by Strata Systems</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
