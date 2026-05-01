import { ChevronDown } from "lucide-react";
import { UserButton } from "@clerk/nextjs";

interface TopbarProps {
  tenantName: string;
}

export function Topbar({ tenantName }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
        <span className="text-muted-foreground">Tenant:</span>
        <span className="font-medium">{tenantName}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </div>
    </header>
  );
}
