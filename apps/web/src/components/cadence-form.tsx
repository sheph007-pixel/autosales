"use client";

import { useState } from "react";
import { createCadenceAction } from "@/lib/actions/cadences";
import { useRouter } from "next/navigation";

interface StepInput {
  delayDays: number;
  templatePrompt: string;
}

export function CreateCadenceForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [steps, setSteps] = useState<StepInput[]>([
    { delayDays: 0, templatePrompt: "Initial outreach email. Introduce ourselves and our group health brokerage services." },
  ]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

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

    setSaving(true);
    try {
      await createCadenceAction({
        name,
        description: description || undefined,
        triggerType,
        steps: steps.map((s) => ({
          delayDays: s.delayDays,
          templatePrompt: s.templatePrompt,
        })),
      });
      setName("");
      setDescription("");
      setSteps([{ delayDays: 0, templatePrompt: "" }]);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g., New Prospect Outreach"
          className="w-full px-3 py-2 border rounded text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 border rounded text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Trigger</label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm bg-background"
        >
          <option value="manual">Manual</option>
          <option value="renewal_approaching">Renewal Approaching</option>
          <option value="new_domain">New Domain Discovered</option>
          <option value="reactivation">Reactivation</option>
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Steps</label>
          <button type="button" onClick={addStep} className="text-xs text-primary hover:underline">
            + Add Step
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
                  <label className="block text-xs text-muted-foreground mb-1">AI Prompt</label>
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
        {saving ? "Creating..." : "Create Cadence"}
      </button>
    </form>
  );
}
