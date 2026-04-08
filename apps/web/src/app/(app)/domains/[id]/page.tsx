import { getCompanyWithDetails } from "@autosales/core/services/company.service";
import { getCompanyMessages } from "@autosales/core/services/thread.service";
import { getCompanyTasks } from "@autosales/core/services/task.service";
import { getMonthName } from "@autosales/core";
import { notFound } from "next/navigation";
import { DomainActions } from "@/components/domain-detail";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  prospect: "bg-blue-100 text-blue-800",
  active_opportunity: "bg-green-100 text-green-800",
  quoted: "bg-yellow-100 text-yellow-800",
  client: "bg-emerald-100 text-emerald-800",
  dormant: "bg-gray-100 text-gray-600",
  suppressed: "bg-red-100 text-red-800",
};

export default async function DomainDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let data: Awaited<ReturnType<typeof getCompanyWithDetails>> = null;
  let messages: Awaited<ReturnType<typeof getCompanyMessages>> = [];
  let tasks: Awaited<ReturnType<typeof getCompanyTasks>> = [];

  try {
    data = await getCompanyWithDetails(params.id);
    if (!data) notFound();
    [messages, tasks] = await Promise.all([
      getCompanyMessages(params.id, 20),
      getCompanyTasks(params.id),
    ]);
  } catch {
    notFound();
  }

  if (!data) notFound();

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{data.companyName ?? data.domain}</h1>
          <p className="text-muted-foreground">{data.domain}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1 rounded-full ${statusColors[data.status] ?? "bg-gray-100"}`}>
            {data.status.replace("_", " ")}
          </span>
          {data.doNotContact && (
            <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-800">DNC</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Info */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Company Info</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{data.status.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Interest</p>
                <p className="font-medium">{data.interestStatus ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Renewal Month</p>
                <p className="font-medium">{data.renewalMonth ? getMonthName(data.renewalMonth) : "Unknown"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Group Health Plan</p>
                <p className="font-medium">
                  {data.hasGroupHealthPlan === null ? "Unknown" : data.hasGroupHealthPlan ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Activity</p>
                <p className="font-medium">
                  {data.lastActivityAt ? new Date(data.lastActivityAt).toLocaleDateString() : "Never"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Next Action</p>
                <p className="font-medium">
                  {data.nextActionAt ? new Date(data.nextActionAt).toLocaleDateString() : "None scheduled"}
                </p>
              </div>
            </div>
          </div>

          {/* AI Memory */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">AI Memory</h2>
            {data.memory ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Summary</p>
                  <p>{data.memory.summary ?? "No summary yet."}</p>
                </div>
                {data.memory.conversationStatus && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Conversation Status</p>
                    <p>{data.memory.conversationStatus}</p>
                  </div>
                )}
                {data.memory.nextSteps && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Next Steps</p>
                    <p>{data.memory.nextSteps}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Updated: {data.memory.updatedAt ? new Date(data.memory.updatedAt).toLocaleString() : "—"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No AI memory yet. Memory will be generated after email sync and classification.
              </p>
            )}
          </div>

          {/* Email Timeline */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Email Timeline ({messages.length})</h2>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails found for this domain.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-sm border-l-2 pl-3 py-1 ${
                      msg.direction === "inbound" ? "border-blue-400" : "border-green-400"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        msg.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                      }`}>
                        {msg.direction === "inbound" ? "IN" : "OUT"}
                      </span>
                      <span className="font-medium">{msg.fromAddress}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(msg.receivedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="font-medium text-xs">{msg.subject}</p>
                    <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                      {msg.bodyText?.slice(0, 200)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Actions */}
          <DomainActions
            companyId={data.id}
            currentStatus={data.status}
            currentInterest={data.interestStatus ?? "unknown"}
            doNotContact={data.doNotContact}
          />

          {/* Contacts */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Contacts ({data.contacts.length})</h2>
            {data.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts found.</p>
            ) : (
              <div className="space-y-3">
                {data.contacts.map((contact) => (
                  <div key={contact.id} className="text-sm">
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-muted-foreground text-xs">{contact.email}</p>
                    {contact.title && <p className="text-muted-foreground text-xs">{contact.title}</p>}
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{contact.status}</span>
                      {contact.doNotContact && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DNC</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enrollments */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Active Cadences</h2>
            {data.enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active enrollments.</p>
            ) : (
              <div className="space-y-2">
                {data.enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="text-sm border rounded p-2">
                    <p className="font-medium">Step {enrollment.currentStep}</p>
                    <p className="text-muted-foreground text-xs">
                      Status: {enrollment.status}
                    </p>
                    {enrollment.nextStepAt && (
                      <p className="text-muted-foreground text-xs">
                        Next step: {new Date(enrollment.nextStepAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Tasks</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="text-sm border-b pb-2 last:border-0">
                    <p className="font-medium">{task.description}</p>
                    <p className="text-muted-foreground text-xs">
                      {task.type} &middot; {task.status}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
