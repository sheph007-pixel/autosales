"use client";

import { useState } from "react";
import { createCampaignAction } from "@/lib/actions/campaigns";
import { useRouter } from "next/navigation";
import { COMPANY_STATUSES, STATUS_LABELS, type CompanyStatus } from "@autosales/core";

interface StepInput {
  delayDays: number;
  templatePrompt: string;
}

export function CreateCampaignForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [instructions, setInstructions] = useState("");
  const [allowedStatuses, setAllowedStatuses] = useState<CompanyStatus[]>(["lead"]);
  const [renewalWithinDays, setRenewalWithinDays] = useState<string>("");
  const [noReplyDays, setNoReplyDays] = useState<string>("");
  const [dailyLimit, setDailyLimit] = useState<string>("");
  const [hourlyLimit, setHourlyLimit] = useState<string>("");
  const [minDelaySeconds, setMinDelaySeconds] = useState<string>("");
  const [steps, setSteps] = useState<StepInput[]>([
    { delayDays: 0, templatePrompt: "Initial outreach — introduce Kennion and ask about current group health setup." },
    { delayDays: 3, templatePrompt: "Soft follow-up — reference prior email, offer a quick review." },
    { delayDays: 7, templatePrompt: "Final nudge — surface timing / renewal angle if known, keep it brief." },
  ]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function toggleStatus(s: CompanyStatus) {
    setAllowedStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  function addStep() {
    setSteps([...steps, { delayDays: 3, templatePrompt: "" }]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: keyof StepInput, value: string | number) {
    const updated = [...steps];
    updated[index] = { ...updated[index]!, [field]: value };
    setSteps(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || steps.length === 0) return;

    const filter: Record<string, unknown> = {};
    if (renewalWithinDays) filter.renewalWithinDays = Number(renewalWithinDays);
    if (noReplyDays) filter.noReplyDays = Number(noReplyDays);

    setSaving(true);
    try {
      await createCampaignAction({
        name,
        description: description || undefined,
        goal: goal || undefined,
        instructions: instructions || undefined,
        allowedStatuses,
        filterJson: filter,
        dailyLimit: dailyLimit ? Number(dailyLimit) : null,
        hourlyLimit: hourlyLimit ? Number(hourlyLimit) : null,
        minimumDelaySeconds: minDelaySeconds ? Number(minDelaySeconds) : null,
        steps: steps.map((s) => ({
          delayDays: s.delayDays,
          templatePrompt: s.templatePrompt,
        })),
      });
      setName("");
      setDescription("");
      setGoal("");
      setInstructions("");
      setAllowedStatuses(["lead"]);
      setRenewalWithinDays("");
      setNoReplyDays("");
      setDailyLimit("");
      setHourlyLimit("");
      setMinDelaySeconds("");
      setSteps([{ delayDays: 0, templatePrompt: "" }]);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Campaign name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g., Lead Outreach Q2"
          className="w-full px-3 py-2 border rounded text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional short description"
          className="w-full px-3 py-2 border rounded text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          placeholder="e.g., Get groups to let us put together a proposal this year or flag them for next year."
          className="w-full px-3 py-2 border rounded text-sm bg-background resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Campaign instructions</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Specific instructions for the AI when writing emails for this campaign."
          className="w-full px-3 py-2 border rounded text-sm bg-background resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Eligible group statuses</label>
        <div className="flex gap-2 flex-wrap">
          {COMPANY_STATUSES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => toggleStatus(s)}
              className={`text-xs px-3 py-1 rounded-full border ${
                allowedStatuses.includes(s)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-muted"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Renewal within (days)</label>
          <input
            value={renewalWithinDays}
            onChange={(e) => setRenewalWithinDays(e.target.value)}
            type="number"
            min={0}
            placeholder="e.g., 120"
            className="w-full px-2 py-1 border rounded text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">No reply in (days)</label>
          <input
            value={noReplyDays}
            onChange={(e) => setNoReplyDays(e.target.value)}
            type="number"
            min={0}
            placeholder="e.g., 30"
            className="w-full px-2 py-1 border rounded text-sm bg-background"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Daily limit</label>
          <input
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            type="number"
            min={0}
            placeholder="global"
            className="w-full px-2 py-1 border rounded text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Hourly limit</label>
          <input
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(e.target.value)}
            type="number"
            min={0}
            placeholder="global"
            className="w-full px-2 py-1 border rounded text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Min delay (sec)</label>
          <input
            value={minDelaySeconds}
            onChange={(e) => setMinDelaySeconds(e.target.value)}
            type="number"
            min={0}
            placeholder="global"
            className="w-full px-2 py-1 border rounded text-sm bg-background"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Steps</label>
          <button type="button" onClick={addStep} className="text-xs text-primary hover:underline">
            + Add step
          </button>
        </div>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Step {i + 1}</span>
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="text-xs text-destructive">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div className="col-span-1">
                  <label className="block text-xs text-muted-foreground mb-1">Delay (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={step.delayDays}
                    onChange={(e) => updateStep(i, "delayDays", parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1 border rounded text-sm bg-background"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-muted-foreground mb-1">AI prompt</label>
                  <textarea
                    value={step.templatePrompt}
                    onChange={(e) => updateStep(i, "templatePrompt", e.target.value)}
                    placeholder="Describe the intent of this step..."
                    rows={2}
                    className="w-full px-2 py-1 border rounded text-sm bg-background resize-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || !name}
        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
