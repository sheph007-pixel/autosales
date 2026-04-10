import { db, emailMessages, classifications, companies, contacts, ensureTables } from "@autosales/db";
import { desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface InboxMessage {
  id: string;
  fromAddress: string;
  subject: string | null;
  bodyText: string | null;
  receivedAt: Date;
  companyId: string | null;
  contactId: string | null;
  classification: string | null;
  confidence: string | null;
  companyDomain: string | null;
}

export default async function InboxPage() {
  let messages: InboxMessage[] = [];

  try {
    await ensureTables();
    const result = await db.execute(sql`
      SELECT
        em.id,
        em.from_address,
        em.subject,
        em.body_text,
        em.received_at,
        em.company_id,
        em.contact_id,
        c.category as classification,
        c.confidence,
        co.domain as company_domain
      FROM email_messages em
      LEFT JOIN classifications c ON c.message_id = em.id
      LEFT JOIN companies co ON co.id = em.company_id
      WHERE em.direction = 'inbound'
      ORDER BY em.received_at DESC
      LIMIT 50
    `);
    messages = result as unknown as InboxMessage[];
  } catch {
    // DB not connected
  }

  const unclassified = messages.filter((m) => !m.classification);
  const classified = messages.filter((m) => m.classification);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inbox / Reply Queue</h1>

      {/* Unclassified replies */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Needs Review ({unclassified.length})</h2>
        <div className="bg-card border rounded-lg overflow-hidden">
          {unclassified.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-sm">
              No unclassified messages. All caught up.
            </p>
          ) : (
            <div className="divide-y">
              {unclassified.map((msg) => (
                <div key={msg.id} className="p-4 hover:bg-muted/50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{msg.fromAddress}</span>
                      {msg.companyDomain && (
                        <Link
                          href={`/domains/${msg.companyId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {msg.companyDomain}
                        </Link>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.receivedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{msg.subject}</p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {msg.bodyText?.slice(0, 300)}
                  </p>
                  <span className="inline-block mt-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                    Pending Classification
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Classified replies */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Classified ({classified.length})</h2>
        <div className="bg-card border rounded-lg overflow-hidden">
          {classified.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-sm">
              No classified messages yet.
            </p>
          ) : (
            <div className="divide-y">
              {classified.map((msg) => (
                <div key={msg.id} className="p-4 hover:bg-muted/50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{msg.fromAddress}</span>
                      {msg.companyDomain && (
                        <Link
                          href={`/domains/${msg.companyId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {msg.companyDomain}
                        </Link>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.receivedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{msg.subject}</p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {msg.bodyText?.slice(0, 300)}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      {msg.classification}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {msg.confidence ? `${(Number(msg.confidence) * 100).toFixed(0)}% confidence` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
