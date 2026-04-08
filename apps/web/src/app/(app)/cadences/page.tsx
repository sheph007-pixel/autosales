import { listCadences, getCadence } from "@autosales/core/services/cadence.service";
import { db, enrollments } from "@autosales/db";
import { eq, sql } from "drizzle-orm";
import { CreateCadenceForm } from "@/components/cadence-form";

export const dynamic = "force-dynamic";

export default async function CadencesPage() {
  let cadenceList: Awaited<ReturnType<typeof listCadences>> = [];
  let enrollmentCounts: Record<string, number> = {};

  try {
    cadenceList = await listCadences();
    if (cadenceList.length > 0) {
      const counts = await db
        .select({
          cadenceId: enrollments.cadenceId,
          count: sql<number>`count(*)`,
        })
        .from(enrollments)
        .where(eq(enrollments.status, "active"))
        .groupBy(enrollments.cadenceId);

      for (const row of counts) {
        enrollmentCounts[row.cadenceId] = Number(row.count);
      }
    }
  } catch {
    // DB not connected
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cadences</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Existing cadences */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Active Cadences</h2>
          {cadenceList.length === 0 ? (
            <div className="bg-card border rounded-lg p-6">
              <p className="text-muted-foreground text-sm">
                No cadences created yet. Create your first cadence to start automated outreach.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cadenceList.map((cadence) => (
                <div key={cadence.id} className="bg-card border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{cadence.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      cadence.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {cadence.isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  {cadence.description && (
                    <p className="text-sm text-muted-foreground mb-2">{cadence.description}</p>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Trigger: {cadence.triggerType}</span>
                    <span>Active enrollments: {enrollmentCounts[cadence.id] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create cadence form */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Create Cadence</h2>
          <CreateCadenceForm />
        </div>
      </div>
    </div>
  );
}
