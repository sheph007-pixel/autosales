"use client";

import { useState, useRef } from "react";

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

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

function detectEmailColumn(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (h.includes("email") || h === "emailaddress" || h === "e_mail") return i;
  }
  // Fall back: find first column that looks like emails in the data
  return -1;
}

export function ImportUploader() {
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [emailCol, setEmailCol] = useState<number>(-1);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    imported?: number;
    companies?: number;
    errors?: string[];
  } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setCsv(parsed);
      setEmailCol(detectEmailColumn(parsed.headers));
      setResult(null);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!csv || emailCol < 0) return;

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: csv.headers,
          rows: csv.rows,
          emailColumn: emailCol,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
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

      {/* Email Column Selection */}
      {csv && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-3">2. Confirm Email Column</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Which column contains email addresses? All other columns will be imported as-is using their header names.
          </p>
          <select
            value={emailCol}
            onChange={(e) => setEmailCol(parseInt(e.target.value))}
            className="px-3 py-2 border rounded text-sm bg-background w-full max-w-md"
          >
            <option value={-1}>-- Select email column --</option>
            {csv.headers.map((h, i) => (
              <option key={i} value={i}>
                {h} (e.g. {csv.rows[0]?.[i] || "—"})
              </option>
            ))}
          </select>
          {emailCol >= 0 && (
            <p className="text-sm text-green-700 mt-2">
              Using &quot;{csv.headers[emailCol]}&quot; as email. All {csv.headers.length - 1} other columns will be stored with their original header names.
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      {csv && emailCol >= 0 && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-3">3. Preview (first 5 rows)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  {csv.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`p-2 text-left font-medium ${i === emailCol ? "bg-primary/10 text-primary" : ""}`}
                    >
                      {h}
                      {i === emailCol && <span className="ml-1 text-[10px]">(EMAIL)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csv.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`p-2 truncate max-w-[150px] ${ci === emailCol ? "font-medium" : ""}`}
                        title={cell}
                      >
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

      {/* Import */}
      {csv && emailCol >= 0 && (
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
              <p className="font-medium">{result.message}</p>
              {result.imported !== undefined && (
                <p>{result.imported} contacts imported into {result.companies} companies</p>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-1 text-xs max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
