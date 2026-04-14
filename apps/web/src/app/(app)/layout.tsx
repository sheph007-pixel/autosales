import { Nav } from "@/components/nav";
import { AutoSync } from "@/components/auto-sync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
      <AutoSync />
    </div>
  );
}
