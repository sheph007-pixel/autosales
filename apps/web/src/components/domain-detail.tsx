"use client";

import { useState } from "react";
import { updateDomainStatusAction } from "@/lib/actions/domains";
import { COMPANY_STATUSES, INTEREST_STATUSES } from "@autosales/core";

export function DomainActions({
  companyId,
  currentStatus,
  currentInterest,
  doNotContact,
}: {
  companyId: string;
  currentStatus: string;
  currentInterest: string;
  doNotContact: boolean;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [interest, setInterest] = useState(currentInterest);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateDomainStatusAction(companyId, {
        status,
        interestStatus: interest,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDnc() {
    setSaving(true);
    try {
      await updateDomainStatusAction(companyId, {
        doNotContact: !doNotContact,
        status: !doNotContact ? "suppressed" : status,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border rounded-lg p-4">
      <h2 className="font-semibold mb-3">Actions</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          >
            {COMPANY_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Interest</label>
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          >
            {INTEREST_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 px-3 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Update Status"}
        </button>

        <button
          onClick={handleToggleDnc}
          disabled={saving}
          className={`w-full py-2 px-3 rounded text-sm font-medium ${
            doNotContact
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-red-600 text-white hover:bg-red-700"
          } disabled:opacity-50`}
        >
          {doNotContact ? "Remove Do-Not-Contact" : "Mark Do-Not-Contact"}
        </button>
      </div>
    </div>
  );
}
