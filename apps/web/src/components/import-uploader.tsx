"use client";

import { useState, useRef } from "react";

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

const TARGET_FIELDS = [
  { key: "skip", label: "-- Skip --" },
  { key: "email", label: "Email *" },
  { key: "name", label: "Full Name" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "title", label: "Job Title" },
  { key: "phone", label: "Phone" },
  { key: "company_name", label: "Company Name" },
  { key: "domain", label: "Domain" },
  { key: "renewal_month", label: "Renewal Month (1-12)" },
  { key: "status", label: "Status" },
  { key: "interest_status", label: "Interest Status" },
  { key: "has_plan", label: "Has Group Health Plan" },
];

function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0 };

  const headers = parseCSVLine(lines[0]!);
  const rows = lines.slice(1).map(parseCSVLine);

  return { headers, rows, totalRows: rows.length };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function autoMapFields(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  for (let i = 0; i < lowerHeaders.length; i++) {
    const h = lowerHeaders[i]!;
    if (h.includes("email") || h === "emailaddress") mapping[i] = "email";
    else if (h === "name" || h === "fullname" || h === "contactname") mapping[i] = "name";
    else if (h === "firstname" || h === "first") mapping[i] = "first_name";
    else if (h === "lastname" || h === "last") mapping[i] = "last_name";
    else if (h.includes("title") || h.includes("jobtitle") || h === "position" || h === "role") mapping[i] = "title";
    else if (h.includes("phone") || h.includes("mobile") || h.includes("cell")) mapping[i] = "phone";
    else if (h === "company" || h === "companyname" || h === "organization" || h === "org") mapping[i] = "company_name";
    else if (h === "domain" || h === "website") mapping[i] = "domain";
    else if (h.includes("renewal")) mapping[i] = "renewal_month";
    else if (h === "status") mapping[i] = "status";
    else mapping[i] = "skip";
  }
  return mapping;
}

export function ImportUploader() {
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; imported?: number; companies?: number; errors?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setCsv(parsed);
      setMapping(autoMapFields(parsed.headers));
      setResult(null);
    };
    reader.readAsText(file);
  }

  function updateMapping(colIndex: number, field: string) {
    setMapping((prev) => ({ ...prev, [colIndex]: field }));
  }

  async function handleImport() {
    if (!csv) return;

    const emailCol = Object.entries(mapping).find(([, v]) => v === "email");
    if (!emailCol) {
      setResult({ success: false, message: "You must map at least the Email field." });
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: csv.headers,
          rows: csv.rows,
          mapping,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, message: "Network error during import." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="font-semibold mb-3">1. Upload CSV</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
        />
        {csv && (
          <p className="text-sm text-muted-foreground mt-2">
            {csv.totalRows} rows, {csv.headers.length} columns detected
          </p>
        )}
      </div>

      {/* Field Mapping */}
      {csv && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-3">2. Map Fields</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Match each CSV column to a field. Email is required. Contacts will be grouped by domain automatically.
          </p>
          <div className="space-y-2">
            {csv.headers.map((header, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-48 text-sm font-medium truncate" title={header}>
                  {header}
                </div>
                <span className="text-muted-foreground text-xs">→</span>
                <select
                  value={mapping[i] || "skip"}
                  onChange={(e) => updateMapping(i, e.target.value)}
                  className="flex-1 px-3 py-1.5 border rounded text-sm bg-background"
                >
                  {TARGET_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground w-32 truncate" title={csv.rows[0]?.[i]}>
                  e.g. {csv.rows[0]?.[i] || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {csv && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-3">3. Preview (first 5 rows)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  {csv.headers.map((h, i) => (
                    <th key={i} className="p-2 text-left font-medium">
                      <div>{h}</div>
                      <div className="text-[10px] text-primary font-normal">
                        → {TARGET_FIELDS.find((f) => f.key === mapping[i])?.label || "Skip"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csv.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {row.map((cell, ci) => (
                      <td key={ci} className="p-2 truncate max-w-[150px]" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Button */}
      {csv && (
        <div className="flex items-center gap-4">
          <button
            onClick={handleImport}
            disabled={importing}
            className="py-2 px-6 bg-primary text-primary-foreground rounded font-medium hover:opacity-90 disabled:opacity-50"
          >
            {importing ? `Importing ${csv.totalRows} contacts...` : `Import ${csv.totalRows} Contacts`}
          </button>
          {result && (
            <div className={`text-sm ${result.success ? "text-green-700" : "text-red-700"}`}>
              {result.message}
              {result.imported !== undefined && (
                <span> ({result.imported} contacts, {result.companies} companies)</span>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-1 text-xs">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                  {result.errors.length > 5 && <div>...and {result.errors.length - 5} more</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
