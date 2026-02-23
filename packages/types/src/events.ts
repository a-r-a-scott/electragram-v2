import { z } from "zod";

import type { Timestamps } from "./common.js";

// ─── Event ────────────────────────────────────────────────────────────────────

export const EventStatusSchema = z.enum(["active", "archived"]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export interface Event extends Timestamps {
  id: string;
  accountId: string;
  name: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: EventStatus;
  guestsCount: number;
  listsCount: number;
  capacityMax: number | null;
  capacityCount: number;
  isOpen: boolean;
}

// ─── Event Guest ──────────────────────────────────────────────────────────────

export const GuestStatusSchema = z.enum([
  "pending",
  "invited",
  "accepted",
  "declined",
  "archived",
  "registered",
  "unsubscribed",
]);
export type GuestStatus = z.infer<typeof GuestStatusSchema>;

export const AttendanceStatusSchema = z.enum([
  "attending",
  "not_attending",
  "maybe",
]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export interface EventGuest extends Timestamps {
  id: string;
  eventId: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: GuestStatus;
  attendanceStatus: AttendanceStatus | null;
  checkedInAt: string | null;
  customFields: Record<string, unknown>;
}

export interface EventGuestProfile extends Timestamps {
  id: string;
  eventGuestId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  notes: string | null;
  bio: string | null;
  guestResponses: Record<string, unknown>;
  customFields: Record<string, unknown>;
  status: GuestStatus;
  attendanceStatus: AttendanceStatus | null;
}

// ─── Event List ───────────────────────────────────────────────────────────────

export interface EventList extends Timestamps {
  id: string;
  eventId: string;
  name: string;
  status: string;
  guestsCount: number;
  isProtected: boolean;
}

// ─── Event Form ───────────────────────────────────────────────────────────────

export const FormFieldKindSchema = z.enum([
  "text",
  "textarea",
  "email",
  "phone",
  "select",
  "multi_select",
  "checkbox",
  "date",
  "number",
]);
export type FormFieldKind = z.infer<typeof FormFieldKindSchema>;

export interface FormField extends Timestamps {
  id: string;
  formId: string;
  name: string;
  kind: FormFieldKind;
  position: number;
  isRequired: boolean;
  description: string | null;
  details: Record<string, unknown>;
}

export interface EventForm extends Timestamps {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  status: string;
  fields?: FormField[];
}

// ─── Event Page ───────────────────────────────────────────────────────────────

export interface EventPage extends Timestamps {
  id: string;
  eventId: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  kind: string;
  domainId: string | null;
  isActive: boolean;
}

// ─── API Schemas ──────────────────────────────────────────────────────────────

export const CreateEventBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  capacityMax: z.number().int().positive().optional(),
  isOpen: z.boolean().optional().default(true),
});
export type CreateEventBody = z.infer<typeof CreateEventBodySchema>;

export const UpdateGuestAttendanceBodySchema = z.object({
  attendanceStatus: AttendanceStatusSchema,
});
export type UpdateGuestAttendanceBody = z.infer<
  typeof UpdateGuestAttendanceBodySchema
>;

export const CheckInGuestBodySchema = z.object({
  checkedInAt: z.string().datetime().optional(),
});
export type CheckInGuestBody = z.infer<typeof CheckInGuestBodySchema>;
