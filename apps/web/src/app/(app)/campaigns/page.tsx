import { db, ensureTables, cadences, enrollments } from "@autosales/db";
import { eq, desc, sql } from "drizzle-orm";
import Link from "next/link";
import { CreateCampaignForm } from "@/components/campaign-form";
import { STATUS_LABELS, type CompanyStatus } from "@autosales/core";

export const dynamic = "force-dynamic";

type CampaignRow = typeof cadences.$inferSelect;

export default async function CampaignsPage() {
  let campaigns: CampaignRow[] = [];
  const enrollmentCounts: Record<string, { active: number; total: number }> = {};
  let errorMessage: string | null = null;

  try {
    await ensureTables();
    campaigns = await db.select().from(cadences).orderBy(desc(cadences.createdAt));

    if (campaigns.length > 0) {
      const counts = await db
        .select({
          cadenceId: enrollments.cadenceId,
          status: enrollments.status,
          count: sql<number>`count(*)::int`,
        })
        .from(enrollments)
        .groupBy(enrollments.cadenceId, enrollments.status);

      for (const row of counts) {
        const entry = enrollmentCounts[row.cadenceId] ?? { active: 0, total: 0 };
        entry.total += Number(row.count);
        if (row.status === "active") entry.active += Number(row.count);
        enrollmentCounts[row.cadenceId] = entry;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Campaigns page error:", err);
  }

  return (
    <div>
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Error loading campaigns:</p>
          <p className="text-xs text-red-700 mt-1 font-mono break-all">{errorMessage}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Each campaign tells the automation engine who to reach and how to talk to them.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">All campaigns</h2>
          {campaigns.length === 0 ? (
            <div className="bg-card border rounded-lg p-6">
              <p className="text-muted-foreground text-sm">
                No campaigns yet. Create one on the right to start autopiloting outreach.
              </p>
            </div>
          ) : (
            <div className="bg-card border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Target</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Active / Total</th>
                    <th className="text-left p-3 font-medium">Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const counts = enrollmentCounts[c.id] ?? { active: 0, total: 0 };
                    const allowed = Array.isArray(c.allowedStatuses) ? c.allowedStatuses : [];
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/50">
                        <td className="p-3">
                          <Link href={`/campaigns/${c.id}`} className="font-medium text-primary hover:underline">
                            {c.name}
                          </Link>
                          {c.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {allowed.length > 0
                            ? allowed.map((s) => STATUS_LABELS[s as CompanyStatus] ?? s).join(", ")
                            : "—"}
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              c.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.isActive ? "Active" : "Paused"}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {counts.active} / {counts.total}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {c.lastRunAt ? new Date(c.lastRunAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">New campaign</h2>
          <CreateCampaignForm />
        </div>
      </div>
    </div>
  );
}
