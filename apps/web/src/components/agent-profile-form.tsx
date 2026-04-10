"use client";

import { useState, useTransition } from "react";
import { updateAgentProfileAction } from "@/lib/actions/agent-profile";

interface AgentProfileValues {
  name: string;
  company: string;
  identity: string;
  targetDescription: string;
  offerDescription: string;
  goals: string;
  toneRules: string;
  systemInstructions: string;
  guardrails: string;
}

export function AgentProfileForm({ initial }: { initial: AgentProfileValues }) {
  const [values, setValues] = useState<AgentProfileValues>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof AgentProfileValues>(key: K, value: AgentProfileValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateAgentProfileAction({
        name: values.name,
        company: values.company,
        identity: values.identity || null,
        targetDescription: values.targetDescription || null,
        offerDescription: values.offerDescription || null,
        goals: values.goals || null,
        toneRules: values.toneRules || null,
        systemInstructions: values.systemInstructions || null,
        guardrails: values.guardrails || null,
      });
      setSaved(true);
    });
  }

  const input =
    "w-full px-3 py-2 border rounded text-sm bg-background";
  const textarea = input + " resize-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Your name</label>
          <input value={values.name} onChange={(e) => set("name", e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Company</label>
          <input value={values.company} onChange={(e) => set("company", e.target.value)} className={input} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Who you are</label>
        <textarea
          rows={2}
          value={values.identity}
          onChange={(e) => set("identity", e.target.value)}
          className={textarea}
          placeholder="e.g., Benefits broker helping small-to-mid-sized employers with group health plans."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">What the company offers</label>
        <textarea
          rows={2}
          value={values.offerDescription}
          onChange={(e) => set("offerDescription", e.target.value)}
          className={textarea}
          placeholder="e.g., Full-service group health brokerage: plan design, carrier negotiation, renewals, enrollment support."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Who you target</label>
        <textarea
          rows={2}
          value={values.targetDescription}
          onChange={(e) => set("targetDescription", e.target.value)}
          className={textarea}
          placeholder="e.g., HR/ops decision-makers at employers with 10–500 employees, particularly around renewal time."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Core goals</label>
        <textarea
          rows={2}
          value={values.goals}
          onChange={(e) => set("goals", e.target.value)}
          className={textarea}
          placeholder="e.g., Get groups to let us put together a proposal this year. If timing is wrong, capture renewal month and flag for follow-up."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tone rules</label>
        <textarea
          rows={2}
          value={values.toneRules}
          onChange={(e) => set("toneRules", e.target.value)}
          className={textarea}
          placeholder="e.g., Conversational but professional. Short sentences. Never pushy or salesy."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Extra system instructions</label>
        <textarea
          rows={2}
          value={values.systemInstructions}
          onChange={(e) => set("systemInstructions", e.target.value)}
          className={textarea}
          placeholder="Additional things the AI should always keep in mind."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Guardrails (never do)</label>
        <textarea
          rows={2}
          value={values.guardrails}
          onChange={(e) => set("guardrails", e.target.value)}
          className={textarea}
          placeholder="e.g., Never quote specific rates. Never imply we're the carrier. Never use the word 'synergy'."
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Agent Profile"}
        </button>
        {saved && !pending && (
          <span className="text-xs text-emerald-700">Saved.</span>
        )}
      </div>
    </form>
  );
}
