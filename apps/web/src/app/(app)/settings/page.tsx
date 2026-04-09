import { getOutlookConnectionStatus } from "@/lib/actions/sync";
import { getSession } from "@/lib/auth";
import { OutlookConnect } from "@/components/outlook-connect";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const outlookStatus = await getOutlookConnectionStatus();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Account */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Signed in as</span>
            <span>{session?.email ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{session?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Auth Provider</span>
            <span>Microsoft</span>
          </div>
        </div>
      </div>

      {/* Outlook Connection */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Outlook Mailbox</h2>
        <OutlookConnect
          connected={outlookStatus.connected}
          email={outlookStatus.email}
          lastSynced={outlookStatus.lastSynced}
        />
      </div>

      {/* System Info */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">System</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform</span>
            <span>Kennion AutoSales v0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deployment</span>
            <span>Railway</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database</span>
            <span>PostgreSQL (Railway)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI Model</span>
            <span>GPT-4o</span>
          </div>
        </div>
      </div>
    </div>
  );
}
