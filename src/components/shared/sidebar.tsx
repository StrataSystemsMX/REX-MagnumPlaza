import { SidebarContent } from "./sidebar-content";

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarContent />
    </aside>
  );
}
