import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
