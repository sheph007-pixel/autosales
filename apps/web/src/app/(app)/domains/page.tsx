import { listCompanies } from "@autosales/core/services/company.service";
import Link from "next/link";
import { getMonthName } from "@autosales/core";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  prospect: "bg-blue-100 text-blue-800",
  active_opportunity: "bg-green-100 text-green-800",
  quoted: "bg-yellow-100 text-yellow-800",
  client: "bg-emerald-100 text-emerald-800",
  dormant: "bg-gray-100 text-gray-600",
  suppressed: "bg-red-100 text-red-800",
};

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string; page?: string };
}) {
  const page = Number(searchParams.page) || 1;
  const limit = 50;
  let result = { companies: [] as Awaited<ReturnType<typeof listCompanies>>["companies"], total: 0 };

  try {
    result = await listCompanies({
      status: searchParams.status,
      search: searchParams.search,
      limit,
      offset: (page - 1) * limit,
    });
  } catch {
    // DB not connected
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Domains ({result.total})</h1>
        <div className="flex gap-2">
          {["prospect", "active_opportunity", "quoted", "client", "dormant"].map((s) => (
            <Link
              key={s}
              href={`/domains${searchParams.status === s ? "" : `?status=${s}`}`}
              className={`text-xs px-2 py-1 rounded ${searchParams.status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              {s.replace("_", " ")}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Domain</th>
              <th className="text-left p-3 font-medium">Company</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Interest</th>
              <th className="text-left p-3 font-medium">Renewal</th>
              <th className="text-left p-3 font-medium">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {result.companies.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No domains found. Connect Outlook and sync to discover domains.
                </td>
              </tr>
            ) : (
              result.companies.map((company) => (
                <tr key={company.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">
                    <Link href={`/domains/${company.id}`} className="font-medium text-primary hover:underline">
                      {company.domain}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{company.companyName ?? "—"}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[company.status] ?? "bg-gray-100"}`}>
                      {company.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{company.interestStatus ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {company.renewalMonth ? getMonthName(company.renewalMonth) : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {company.lastActivityAt
                      ? new Date(company.lastActivityAt).toLocaleDateString()
                      : "—"}
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
