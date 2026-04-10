"use client";

import { useState } from "react";
import { updateGroupAction } from "@/lib/actions/groups";
import { COMPANY_STATUSES, STATUS_LABELS } from "@autosales/core";

interface ContactOption {
  id: string;
  name: string;
  email: string;
}

export function GroupActions({
  groupId,
  currentStatus,
  currentRenewalMonth,
  currentHasGroupHealthPlan,
  currentPrimaryContactId,
  doNotContact,
  contacts,
}: {
  groupId: string;
  currentStatus: string;
  currentRenewalMonth: number | null;
  currentHasGroupHealthPlan: boolean | null;
  currentPrimaryContactId: string | null;
  doNotContact: boolean;
  contacts: ContactOption[];
}) {
  const [status, setStatus] = useState(currentStatus);
  const [renewalMonth, setRenewalMonth] = useState<string>(currentRenewalMonth?.toString() ?? "");
  const [hasPlan, setHasPlan] = useState<string>(
    currentHasGroupHealthPlan === null ? "unknown" : currentHasGroupHealthPlan ? "yes" : "no"
  );
  const [primaryContactId, setPrimaryContactId] = useState<string>(currentPrimaryContactId ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await updateGroupAction(groupId, {
        status,
        renewalMonth: renewalMonth ? parseInt(renewalMonth) : null,
        hasGroupHealthPlan: hasPlan === "yes" ? true : hasPlan === "no" ? false : null,
        primaryContactId: primaryContactId || null,
      });
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDnc() {
    setSaving(true);
    try {
      await updateGroupAction(groupId, { doNotContact: !doNotContact });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border rounded-lg p-4">
      <h2 className="font-semibold mb-3">Edit Group</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          >
            {COMPANY_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Primary Contact</label>
          <select
            value={primaryContactId}
            onChange={(e) => setPrimaryContactId(e.target.value)}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          >
            <option value="">— None —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Renewal Month</label>
          <select
            value={renewalMonth}
            onChange={(e) => setRenewalMonth(e.target.value)}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          >
            <option value="">Unknown</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" })}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Has Group Health Plan</label>
          <select
            value={hasPlan}
            onChange={(e) => setHasPlan(e.target.value)}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          >
            <option value="unknown">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 px-3 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        {savedAt && <p className="text-xs text-green-700 text-center">Saved at {savedAt}</p>}

        <button
          onClick={handleToggleDnc}
          disabled={saving}
          className={`w-full py-2 px-3 rounded text-sm font-medium ${
            doNotContact
              ? "bg-green-600 text-white hover:bg-green-700"
              : "border border-red-300 text-red-700 hover:bg-red-50"
          } disabled:opacity-50`}
        >
          {doNotContact ? "Resume Automation" : "Pause Automation"}
        </button>
      </div>
    </div>
  );
}
