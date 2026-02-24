import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "../db/client.js";
import { uploads, uploadErrors, uploadRefs } from "../db/schema.js";
import { NotFoundError } from "./errors.js";

export interface UploadRow {
  id: string;
  accountId: string;
  userId: string;
  status: string;
  purpose: string | null;
  relateableId: string | null;
  relateableType: string | null;
  mapping: Record<string, string> | null;
  details: Record<string, unknown> | null;
  analyzedAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadErrorRow {
  id: string;
  uploadId: string;
  rowIndex: number | null;
  rowData: Record<string, unknown> | null;
  messages: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadRefRow {
  id: string;
  uploadId: string;
  recordType: string;
  recordId: string;
  created: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UploadsService {
  constructor(private readonly db: Db) {}

  async create(params: {
    accountId: string;
    userId: string;
    purpose?: string | undefined;
    relateableId?: string | undefined;
    relateableType?: string | undefined;
    mapping?: Record<string, string> | undefined;
    details?: Record<string, unknown> | undefined;
  }): Promise<UploadRow> {
    const [row] = await this.db
      .insert(uploads)
      .values({
        id: nanoid(),
        accountId: params.accountId,
        userId: params.userId,
        purpose: params.purpose ?? null,
        relateableId: params.relateableId ?? null,
        relateableType: params.relateableType ?? null,
        mapping: params.mapping ?? null,
        details: params.details ?? null,
      })
      .returning();
    return row as unknown as UploadRow;
  }

  async getById(id: string, accountId: string): Promise<UploadRow> {
    const [row] = await this.db
      .select()
      .from(uploads)
      .where(and(eq(uploads.id, id), eq(uploads.accountId, accountId)));
    if (!row) throw new NotFoundError(`Upload ${id} not found`);
    return row as unknown as UploadRow;
  }

  async setStatus(id: string, status: "analyzing" | "analyzed" | "processing" | "processed" | "failed"): Promise<void> {
    const now = new Date();
    await this.db
      .update(uploads)
      .set({
        status,
        ...(status === "analyzed" ? { analyzedAt: now } : {}),
        ...(status === "processed" ? { processedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(uploads.id, id));
  }

  async recordError(params: {
    uploadId: string;
    rowIndex: number;
    rowData: Record<string, unknown>;
    messages: string[];
  }): Promise<void> {
    await this.db.insert(uploadErrors).values({
      id: nanoid(),
      uploadId: params.uploadId,
      rowIndex: params.rowIndex,
      rowData: params.rowData,
      messages: params.messages,
    });
  }

  async recordRef(params: {
    uploadId: string;
    recordType: string;
    recordId: string;
    created: boolean;
  }): Promise<void> {
    await this.db.insert(uploadRefs).values({
      id: nanoid(),
      uploadId: params.uploadId,
      recordType: params.recordType,
      recordId: params.recordId,
      created: params.created,
    });
  }

  async getErrors(uploadId: string): Promise<UploadErrorRow[]> {
    const rows = await this.db
      .select()
      .from(uploadErrors)
      .where(eq(uploadErrors.uploadId, uploadId));
    return rows as unknown as UploadErrorRow[];
  }

  async getRefs(uploadId: string): Promise<UploadRefRow[]> {
    const rows = await this.db
      .select()
      .from(uploadRefs)
      .where(eq(uploadRefs.uploadId, uploadId));
    return rows as unknown as UploadRefRow[];
  }
}
