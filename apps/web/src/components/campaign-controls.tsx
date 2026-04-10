"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCampaignActiveAction, deleteCampaignAction } from "@/lib/actions/campaigns";

export function CampaignControls({
  campaignId,
  isActive,
}: {
  campaignId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const onToggle = () => {
    startTransition(async () => {
      await setCampaignActiveAction(campaignId, !isActive);
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      await deleteCampaignAction(campaignId);
      router.push("/campaigns");
    });
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={onToggle}
        disabled={pending}
        className={`px-3 py-1.5 text-sm rounded border ${
          isActive ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
        } disabled:opacity-50`}
      >
        {pending ? "…" : isActive ? "Pause" : "Start"}
      </button>
      <button
        onClick={onDelete}
        disabled={pending}
        className="px-3 py-1.5 text-sm rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {confirming ? "Confirm delete" : "Delete"}
      </button>
    </div>
  );
}
