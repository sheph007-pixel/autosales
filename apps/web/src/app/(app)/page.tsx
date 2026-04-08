import { getDashboardStats } from "@autosales/core/services/company.service";
import { getPendingTasks } from "@autosales/core/services/task.service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let stats = {
    total: 0,
    prospects: 0,
    activeOpportunities: 0,
    clients: 0,
    quoted: 0,
    suppressed: 0,
    withRenewal: 0,
    needsAction: 0,
  };
  let pendingTasks: Awaited<ReturnType<typeof getPendingTasks>> = [];

  try {
    stats = await getDashboardStats();
    pendingTasks = await getPendingTasks(10);
  } catch {
    // DB not connected yet — show empty state
  }

  const statCards = [
    { label: "Total Domains", value: stats.total, href: "/domains" },
    { label: "Prospects", value: stats.prospects, href: "/domains?status=prospect" },
    { label: "Active Opportunities", value: stats.activeOpportunities, href: "/domains?status=active_opportunity" },
    { label: "Quoted", value: stats.quoted, href: "/domains?status=quoted" },
    { label: "Clients", value: stats.clients, href: "/domains?status=client" },
    { label: "Needs Action", value: stats.needsAction, href: "/domains?needsAction=true" },
    { label: "Known Renewals", value: stats.withRenewal, href: "/domains" },
    { label: "Suppressed", value: stats.suppressed, href: "/domains?status=suppressed" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
          </Link>
        ))}
      </div>

      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Pending Tasks</h2>
        {pendingTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pending tasks. Connect Outlook in Settings to get started.</p>
        ) : (
          <div className="space-y-2">
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{task.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.type} &middot; Due {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "now"}
                  </p>
                </div>
                <span className="text-xs bg-muted px-2 py-1 rounded">{task.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
