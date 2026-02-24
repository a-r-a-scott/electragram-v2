import { parse } from "csv-parse";
import type { UploadsService } from "./uploads.service.js";

export interface ContactRecord {
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
  extra?: Record<string, unknown> | undefined;
}

/**
 * Injectable interface for creating contacts from imported rows.
 * In production this calls the Contacts service via HTTP.
 */
export interface ContactImporter {
  upsert(params: {
    accountId: string;
    email: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
  }): Promise<{ id: string; created: boolean }>;
}

export interface ProcessResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
}

/**
 * Parses a CSV buffer using a column mapping and imports each row.
 * Records per-row errors and upload refs back to the DB.
 */
export async function processCsvUpload(params: {
  uploadId: string;
  accountId: string;
  csvBuffer: Buffer;
  mapping: Record<string, string>;
  uploadsService: UploadsService;
  contactImporter: ContactImporter;
}): Promise<ProcessResult> {
  const { uploadId, accountId, csvBuffer, mapping, uploadsService, contactImporter } = params;

  const rows = await parseCsv(csvBuffer);
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, string>;
    const contact = applyMapping(row, mapping);

    if (!contact.email) {
      await uploadsService.recordError({
        uploadId,
        rowIndex: i + 1,
        rowData: row,
        messages: ["Missing required field: email"],
      });
      skipped++;
      continue;
    }

    try {
      const result = await contactImporter.upsert({
        accountId,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
      });

      await uploadsService.recordRef({
        uploadId,
        recordType: "Contact",
        recordId: result.id,
        created: result.created,
      });

      imported++;
    } catch (err) {
      await uploadsService.recordError({
        uploadId,
        rowIndex: i + 1,
        rowData: row,
        messages: [String(err)],
      });
      errors++;
    }
  }

  return { total: rows.length, imported, skipped, errors };
}

function parseCsv(buffer: Buffer): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    parse(buffer, { columns: true, trim: true, skip_empty_lines: true }, (err, records) => {
      if (err) reject(err);
      else resolve(records as unknown[]);
    });
  });
}

/**
 * Apply the column mapping to a raw CSV row.
 * mapping is { internalField: csvColumnHeader }, e.g. { email: "Email Address" }
 */
function applyMapping(row: Record<string, string>, mapping: Record<string, string>): ContactRecord {
  const get = (field: string): string | undefined => {
    const header = mapping[field];
    if (!header) return undefined;
    const val = row[header];
    return val?.trim() || undefined;
  };

  return {
    email: get("email") ?? "",
    firstName: get("firstName") ?? get("first_name"),
    lastName: get("lastName") ?? get("last_name"),
    phone: get("phone"),
  };
}
