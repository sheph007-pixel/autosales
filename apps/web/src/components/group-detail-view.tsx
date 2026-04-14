"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui/utils";

interface Contact {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
}

interface Message {
  id: string;
  subject: string | null;
  direction: string;
  from_address: string;
  to_addresses: string;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  contact_id: string | null;
}

interface GroupDetailViewProps {
  group: {
    id: string;
    domain: string;
    company_name: string | null;
    status: string;
  };
  contacts: Contact[];
  messages: Message[];
}

export function GroupDetailView({ group, contacts, messages }: GroupDetailViewProps) {
  const router = useRouter();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        setSyncResult(`Fetched ${data.totalFetched}, matched ${data.processed}, skipped ${data.skippedUnknown}`);
        if (data.processed > 0) router.refresh();
      }
    } catch (err) {
      setSyncResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }, [router]);

  const filteredMessages = selectedContactId
    ? messages.filter((m) => m.contact_id === selectedContactId)
    : messages;

  const selectedContact = contacts.find((c) => c.id === selectedContactId);

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 border rounded-lg overflow-hidden bg-card">
      {/* Left panel: Contacts */}
      <div className="w-64 min-w-[16rem] border-r flex flex-col">
        <div className="p-3 border-b bg-muted/50">
          <h2 className="font-semibold text-sm">Contacts ({contacts.length})</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* All contacts option */}
          <button
            onClick={() => setSelectedContactId(null)}
            className={cn(
              "w-full text-left px-3 py-2.5 border-b text-sm transition-colors",
              !selectedContactId
                ? "bg-primary/10 border-l-2 border-l-primary"
                : "hover:bg-muted/50"
            )}
          >
            <p className="font-medium">All Contacts</p>
            <p className="text-xs text-muted-foreground">{messages.length} emails</p>
          </button>

          {contacts.map((contact) => {
            const contactMsgCount = messages.filter((m) => m.contact_id === contact.id).length;
            return (
              <button
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b text-sm transition-colors",
                  selectedContactId === contact.id
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-muted/50"
                )}
              >
                <p className="font-medium truncate">{contact.name}</p>
                <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                {contact.title && (
                  <p className="text-xs text-muted-foreground/70 truncate">{contact.title}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {contactMsgCount} {contactMsgCount === 1 ? "email" : "emails"}
                </p>
              </button>
            );
          })}

          {contacts.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No contacts yet.</p>
          )}
        </div>
      </div>

      {/* Right panel: Emails */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">
              {selectedContact ? selectedContact.name : "All Emails"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selectedContact ? selectedContact.email : `${group.company_name || group.domain}`}
              {" "}&middot; {filteredMessages.length} {filteredMessages.length === 1 ? "message" : "messages"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {syncResult && (
              <span className={cn(
                "text-xs",
                syncResult.startsWith("Error") || syncResult.startsWith("Failed")
                  ? "text-red-600" : "text-green-600"
              )}>
                {syncResult}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1 text-xs border rounded hover:bg-muted disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {selectedContact
                ? `No emails found for ${selectedContact.name}.`
                : "No emails synced for this group yet. Connect Outlook to sync emails."}
            </div>
          ) : (
            <div className="divide-y">
              {filteredMessages.map((msg) => {
                const isExpanded = expandedMessageId === msg.id;
                const isInbound = msg.direction === "inbound";
                return (
                  <div key={msg.id} className="group">
                    <button
                      onClick={() => setExpandedMessageId(isExpanded ? null : msg.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 transition-colors",
                        isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            isInbound
                              ? "bg-blue-50 text-blue-700"
                              : "bg-green-50 text-green-700"
                          )}
                        >
                          {isInbound ? "IN" : "OUT"}
                        </span>
                        <span className="text-sm font-medium truncate">{msg.from_address}</span>
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {new Date(msg.received_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        {msg.subject || "(no subject)"}
                      </p>
                      {!isExpanded && msg.body_text && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {msg.body_text.slice(0, 150)}
                        </p>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 bg-muted/10">
                        <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                          <p><span className="font-medium">From:</span> {msg.from_address}</p>
                          <p><span className="font-medium">Date:</span> {new Date(msg.received_at).toLocaleString()}</p>
                        </div>
                        {msg.body_html ? (
                          <div
                            className="text-sm prose prose-sm max-w-none [&_*]:text-sm"
                            dangerouslySetInnerHTML={{ __html: msg.body_html }}
                          />
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap font-sans">
                            {msg.body_text || "(empty)"}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
