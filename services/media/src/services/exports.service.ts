import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { exports as exportsTable } from "../db/schema.js";
import { NotFoundError } from "./errors.js";

export interface ExportRow {
  id: string;
  accountId: string;
  userId: string;
  status: string;
  label: string | null;
  exportType: string;
  recordType: string | null;
  recordId: string | null;
  details: Record<string, unknown> | null;
  exportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ExportsService {
  constructor(private readonly db: Db) {}

  async create(params: {
    accountId: string;
    userId: string;
    exportType: string;
    label?: string | undefined;
    recordType?: string | undefined;
    recordId?: string | undefined;
  }): Promise<ExportRow> {
    const [row] = await this.db
      .insert(exportsTable)
      .values({
        id: nanoid(),
        accountId: params.accountId,
        userId: params.userId,
        exportType: params.exportType,
        label: params.label ?? null,
        recordType: params.recordType ?? null,
        recordId: params.recordId ?? null,
      })
      .returning();
    return row as unknown as ExportRow;
  }

  async getById(id: string, accountId: string): Promise<ExportRow> {
    const [row] = await this.db
      .select()
      .from(exportsTable)
      .where(and(eq(exportsTable.id, id), eq(exportsTable.accountId, accountId)));
    if (!row) throw new NotFoundError(`Export ${id} not found`);
    return row as unknown as ExportRow;
  }

  async setProcessing(id: string): Promise<void> {
    await this.db
      .update(exportsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(exportsTable.id, id));
  }

  async setCompleted(id: string, details: Record<string, unknown>): Promise<void> {
    await this.db
      .update(exportsTable)
      .set({ status: "completed", exportedAt: new Date(), details, updatedAt: new Date() })
      .where(eq(exportsTable.id, id));
  }

  async setFailed(id: string, error: string): Promise<void> {
    await this.db
      .update(exportsTable)
      .set({ status: "failed", details: { error }, updatedAt: new Date() })
      .where(eq(exportsTable.id, id));
  }
}
