import { describe, it, expect, vi, beforeEach } from "vitest";
import { processCsvUpload } from "../../src/services/csv-processor.js";
import type { UploadsService } from "../../src/services/uploads.service.js";
import type { ContactImporter } from "../../src/services/csv-processor.js";

function makeUploads() {
  return {
    recordError: vi.fn().mockResolvedValue(undefined),
    recordRef: vi.fn().mockResolvedValue(undefined),
  } as unknown as UploadsService;
}

function makeImporter(responses: Array<{ id: string; created: boolean }> = []) {
  let idx = 0;
  return {
    upsert: vi.fn().mockImplementation(async () => responses[idx++] ?? { id: "contact_x", created: false }),
  } as unknown as ContactImporter;
}

const mapping = { email: "Email", firstName: "First Name", lastName: "Last Name", phone: "Phone" };

function makeCsv(rows: Array<Record<string, string>>): Buffer {
  const headers = Object.keys(rows[0] ?? {}).join(",");
  const lines = rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(","));
  return Buffer.from([headers, ...lines].join("\n"), "utf8");
}

describe("processCsvUpload", () => {
  let uploads: UploadsService;
  let importer: ContactImporter;

  beforeEach(() => {
    uploads = makeUploads();
    importer = makeImporter([
      { id: "c1", created: true },
      { id: "c2", created: false },
    ]);
  });

  it("imports valid rows and creates refs", async () => {
    const csv = makeCsv([
      { "Email": "alice@example.com", "First Name": "Alice", "Last Name": "Smith", "Phone": "555-1234" },
      { "Email": "bob@example.com", "First Name": "Bob", "Last Name": "Jones", "Phone": "" },
    ]);

    const result = await processCsvUpload({ uploadId: "upl_1", accountId: "acc_1", csvBuffer: csv, mapping, uploadsService: uploads, contactImporter: importer });

    expect(result.total).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(uploads.recordRef).toHaveBeenCalledTimes(2);
  });

  it("skips rows without email", async () => {
    const csv = makeCsv([
      { "Email": "", "First Name": "No", "Last Name": "Email", "Phone": "" },
      { "Email": "valid@example.com", "First Name": "Valid", "Last Name": "User", "Phone": "" },
    ]);

    const result = await processCsvUpload({ uploadId: "upl_1", accountId: "acc_1", csvBuffer: csv, mapping, uploadsService: uploads, contactImporter: importer });

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(1);
    expect(uploads.recordError).toHaveBeenCalledOnce();
  });

  it("counts errors when importer throws", async () => {
    const failingImporter = {
      upsert: vi.fn().mockRejectedValue(new Error("DB error")),
    } as unknown as ContactImporter;

    const csv = makeCsv([
      { "Email": "test@example.com", "First Name": "Test", "Last Name": "User", "Phone": "" },
    ]);

    const result = await processCsvUpload({ uploadId: "upl_1", accountId: "acc_1", csvBuffer: csv, mapping, uploadsService: uploads, contactImporter: failingImporter });

    expect(result.errors).toBe(1);
    expect(uploads.recordError).toHaveBeenCalledOnce();
  });

  it("handles empty CSV (no rows after header)", async () => {
    const csv = Buffer.from("Email,First Name,Last Name\n", "utf8");
    const result = await processCsvUpload({ uploadId: "upl_1", accountId: "acc_1", csvBuffer: csv, mapping, uploadsService: uploads, contactImporter: importer });
    expect(result.total).toBe(0);
    expect(result.imported).toBe(0);
  });

  it("applies column mapping correctly", async () => {
    const csv = makeCsv([{ "Email": "mapped@example.com", "First Name": "Mapped", "Last Name": "User", "Phone": "999" }]);
    await processCsvUpload({ uploadId: "upl_1", accountId: "acc_1", csvBuffer: csv, mapping, uploadsService: uploads, contactImporter: importer });
    const importCall = (importer.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, string>;
    expect(importCall?.["email"]).toBe("mapped@example.com");
    expect(importCall?.["firstName"]).toBe("Mapped");
    expect(importCall?.["phone"]).toBe("999");
  });
});
