import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; detail?: string };
}) {
  const session = await getSession();
  if (session) redirect("/");

  const errorMessages: Record<string, string> = {
    config: "Microsoft OAuth is not configured. Check environment variables.",
    unauthorized: "Your Microsoft account is not authorized to access this app.",
    auth_failed: "Authentication failed. See details below.",
    no_email: "Could not retrieve email from Microsoft account.",
    no_code: "No authorization code received from Microsoft.",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="w-full max-w-sm bg-card p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-2">Kennion AutoSales</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Group Health Brokerage AI Platform
        </p>

        {searchParams.error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-left">
            <p className="text-sm text-red-800 font-medium">
              {errorMessages[searchParams.error] || searchParams.error}
            </p>
            {searchParams.detail && (
              <p className="text-xs text-red-600 mt-1 break-all">
                {decodeURIComponent(searchParams.detail)}
              </p>
            )}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="inline-flex items-center justify-center gap-3 w-full py-3 px-4 bg-[#2f2f2f] text-white rounded-md font-medium hover:bg-[#1a1a1a] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </a>

        <p className="text-xs text-muted-foreground mt-6">
          Signs you in and connects your Outlook mailbox in one step.
        </p>

        <p className="text-[10px] text-muted-foreground/50 mt-4">
          v{process.env.BUILD_VERSION} &middot; {process.env.BUILD_TIME ? new Date(process.env.BUILD_TIME).toLocaleString() : ""}
        </p>
      </div>
    </div>
  );
}
