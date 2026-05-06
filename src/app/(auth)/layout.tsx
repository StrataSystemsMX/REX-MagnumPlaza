import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <Image
          src="/logo/StrataSystem_logo.png"
          alt="Strata Systems"
          width={160}
          height={160}
          className="mb-4 size-32 rounded-2xl object-cover shadow-sm"
          priority
        />
        <h1 className="text-2xl font-semibold tracking-tight">Rex</h1>
        <p className="text-sm text-muted-foreground">CRM Inmobiliario · by Strata Systems</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
