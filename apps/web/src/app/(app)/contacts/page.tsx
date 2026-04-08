import { listContacts } from "@autosales/core/services/contact.service";
import { db, companies } from "@autosales/db";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Number(searchParams.page) || 1;
  let result = { contacts: [] as Awaited<ReturnType<typeof listContacts>>["contacts"], total: 0 };

  try {
    result = await listContacts({
      search: searchParams.search,
      limit: 50,
      offset: (page - 1) * 50,
    });
  } catch {
    // DB not connected
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Contacts ({result.total})</h1>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-left p-3 font-medium">Title</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Last Replied</th>
              <th className="text-left p-3 font-medium">Domain</th>
            </tr>
          </thead>
          <tbody>
            {result.contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No contacts found. They will be created automatically during email sync.
                </td>
              </tr>
            ) : (
              result.contacts.map((contact) => (
                <tr key={contact.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-medium">{contact.name}</td>
                  <td className="p-3 text-muted-foreground">{contact.email}</td>
                  <td className="p-3 text-muted-foreground">{contact.title ?? "—"}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      contact.status === "active" ? "bg-green-100 text-green-800" :
                      contact.status === "wrong_person" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {contact.lastRepliedAt ? new Date(contact.lastRepliedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">
                    <Link href={`/domains/${contact.companyId}`} className="text-primary hover:underline text-xs">
                      View Domain
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
