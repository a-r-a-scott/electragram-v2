import { z } from "zod";

// ─── Pagination ──────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ─── API Response ────────────────────────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── Common enums ────────────────────────────────────────────────────────────

export const ChannelSchema = z.enum(["email", "sms", "whatsapp"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const StatusSchema = z.enum(["active", "archived", "deleted"]);
export type Status = z.infer<typeof StatusSchema>;

// ─── ID format ───────────────────────────────────────────────────────────────

export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

// ─── Timestamps ──────────────────────────────────────────────────────────────

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}
