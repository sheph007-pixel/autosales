import { getOutlookConnectionStatus } from "@/lib/actions/sync";
import { getSession } from "@/lib/auth";
import { OutlookConnect } from "@/components/outlook-connect";
import { AgentProfileForm } from "@/components/agent-profile-form";
import { getAgentProfile } from "@autosales/core/services/agent-profile.service";
import { ensureTables } from "@autosales/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const outlookStatus = await getOutlookConnectionStatus();

  let profile = null;
  try {
    await ensureTables();
    profile = await getAgentProfile();
  } catch (err) {
    console.error("Settings page: could not load agent profile", err);
  }

  const initial = {
    name: profile?.name ?? "Hunter Shepherd",
    company: profile?.company ?? "Kennion",
    identity: profile?.identity ?? "",
    targetDescription: profile?.targetDescription ?? "",
    offerDescription: profile?.offerDescription ?? "",
    goals: profile?.goals ?? "",
    toneRules: profile?.toneRules ?? "",
    systemInstructions: profile?.systemInstructions ?? "",
    guardrails: profile?.guardrails ?? "",
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Agent Profile / Playbook */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">Agent Profile</h2>
        <p className="text-xs text-muted-foreground mb-4">
          This is the single global AI persona the system uses when generating emails. Every campaign inherits from
          this profile unless it overrides with campaign-specific instructions.
        </p>
        <AgentProfileForm initial={initial} />
      </div>

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
