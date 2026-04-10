"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCampaignActiveAction } from "@/lib/actions/campaigns";

export function CampaignRowControls({
  campaignId,
  isActive,
}: {
  campaignId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await setCampaignActiveAction(campaignId, !isActive);
      router.refresh();
    });
  };

  return (
    <button
      onClick={onToggle}
      disabled={pending}
      className={`text-xs px-2 py-1 rounded border ${
        isActive
          ? "bg-muted text-foreground hover:bg-accent"
          : "bg-primary text-primary-foreground hover:opacity-90"
      } disabled:opacity-50`}
    >
      {pending ? "…" : isActive ? "Pause" : "Start"}
    </button>
  );
}
