import { ImportUploader } from "@/components/import-uploader";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Import Contacts</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Upload a CSV file and map columns to fields. Contacts will be automatically grouped by email domain into companies.
      </p>
      <ImportUploader />
    </div>
  );
}
