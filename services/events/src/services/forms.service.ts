import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client.js";
import {
  eventForms,
  eventFormFields,
  guestFormResponses,
  eventGuests,
} from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError } from "./errors.js";

export const CreateFormSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const UpdateFormSchema = CreateFormSchema.partial();

export const FormFieldSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z
    .enum(["text", "textarea", "email", "phone", "select", "multi_select", "checkbox", "date", "number"])
    .default("text"),
  position: z.number().int().nonnegative().default(0),
  content: z.string().optional(),
  isRequired: z.boolean().default(false),
  description: z.string().optional(),
  details: z.record(z.unknown()).default({}),
});

export const UpdateFormFieldsSchema = z.object({
  fields: z.array(
    FormFieldSchema.extend({ id: z.string().optional() })
  ),
});

export const SubmitFormResponseSchema = z.object({
  answers: z.record(z.unknown()),
  comment: z.string().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
  isAdditionalGuest: z.boolean().optional().default(false),
});

export type CreateFormInput = z.infer<typeof CreateFormSchema>;
export type UpdateFormInput = z.infer<typeof UpdateFormSchema>;
export type UpdateFormFieldsInput = z.infer<typeof UpdateFormFieldsSchema>;
export type SubmitFormResponseInput = z.infer<typeof SubmitFormResponseSchema>;

export interface FormRecord {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  status: string;
  fields: FormFieldRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface FormFieldRecord {
  id: string;
  formId: string;
  name: string;
  kind: string;
  position: number;
  content: string | null;
  isRequired: boolean;
  description: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FormResponseRecord {
  id: string;
  formId: string;
  eventGuestId: string;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  isAdditionalGuest: boolean;
  comment: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class FormsService {
  constructor(private readonly db: Db) {}

  async listForms(eventId: string): Promise<FormRecord[]> {
    const forms = await this.db
      .select()
      .from(eventForms)
      .where(eq(eventForms.eventId, eventId))
      .orderBy(eventForms.createdAt);

    const fields = await this.db
      .select()
      .from(eventFormFields)
      .where(
        eventForms.id
          ? eq(
              eventFormFields.formId,
              sql`ANY(${forms.map((f) => f.id)}::text[])`
            )
          : sql`false`
      );

    const fieldsByForm = new Map<string, typeof eventFormFields.$inferSelect[]>();
    for (const f of fields) {
      const list = fieldsByForm.get(f.formId) ?? [];
      list.push(f);
      fieldsByForm.set(f.formId, list);
    }

    return forms.map((form) =>
      mapForm(form, fieldsByForm.get(form.id) ?? [])
    );
  }

  async getForm(eventId: string, formId: string): Promise<FormRecord> {
    const [form] = await this.db
      .select()
      .from(eventForms)
      .where(and(eq(eventForms.id, formId), eq(eventForms.eventId, eventId)))
      .limit(1);
    if (!form) throw new NotFoundError("Form not found");

    const fields = await this.db
      .select()
      .from(eventFormFields)
      .where(eq(eventFormFields.formId, formId))
      .orderBy(eventFormFields.position);

    return mapForm(form, fields);
  }

  async createForm(eventId: string, input: CreateFormInput): Promise<FormRecord> {
    const id = generateId("frm");
    const [form] = await this.db
      .insert(eventForms)
      .values({
        id,
        eventId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();

    return mapForm(form!, []);
  }

  async updateForm(
    eventId: string,
    formId: string,
    input: UpdateFormInput
  ): Promise<FormRecord> {
    await this.requireForm(eventId, formId);

    const [updated] = await this.db
      .update(eventForms)
      .set({
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      })
      .where(eq(eventForms.id, formId))
      .returning();

    const fields = await this.db
      .select()
      .from(eventFormFields)
      .where(eq(eventFormFields.formId, formId))
      .orderBy(eventFormFields.position);

    return mapForm(updated!, fields);
  }

  async updateFormFields(
    eventId: string,
    formId: string,
    input: UpdateFormFieldsInput
  ): Promise<FormRecord> {
    await this.requireForm(eventId, formId);

    await this.db
      .delete(eventFormFields)
      .where(eq(eventFormFields.formId, formId));

    const values = input.fields.map((f, i) => ({
      id: f.id ?? generateId("fld"),
      formId,
      name: f.name,
      kind: f.kind,
      position: f.position ?? i,
      content: f.content ?? null,
      isRequired: f.isRequired ?? false,
      description: f.description ?? null,
      details: f.details ?? {},
    }));

    if (values.length > 0) {
      await this.db.insert(eventFormFields).values(values as any[]);
    }

    await this.db
      .update(eventForms)
      .set({ updatedAt: new Date() })
      .where(eq(eventForms.id, formId));

    return this.getForm(eventId, formId);
  }

  async deleteForm(eventId: string, formId: string): Promise<void> {
    await this.requireForm(eventId, formId);
    await this.db.delete(eventForms).where(eq(eventForms.id, formId));
  }

  async submitFormResponse(
    eventId: string,
    formId: string,
    eventGuestId: string,
    input: SubmitFormResponseInput
  ): Promise<FormResponseRecord> {
    const [eventGuest] = await this.db
      .select({ id: eventGuests.id })
      .from(eventGuests)
      .where(
        and(eq(eventGuests.id, eventGuestId), eq(eventGuests.eventId, eventId))
      )
      .limit(1);
    if (!eventGuest) throw new NotFoundError("Event guest not found");

    const id = generateId("frs");
    const [response] = await this.db
      .insert(guestFormResponses)
      .values({
        id,
        formId,
        eventGuestId,
        answers: input.answers,
        comment: input.comment ?? null,
        metadata: input.metadata ?? {},
        isAdditionalGuest: input.isAdditionalGuest ?? false,
        submittedAt: new Date(),
      })
      .returning();

    await this.db
      .update(eventGuests)
      .set({ hasResponded: true, updatedAt: new Date() })
      .where(eq(eventGuests.id, eventGuestId));

    return mapFormResponse(response!);
  }

  async getFormResponses(
    eventId: string,
    formId: string
  ): Promise<FormResponseRecord[]> {
    await this.requireForm(eventId, formId);

    const responses = await this.db
      .select()
      .from(guestFormResponses)
      .where(eq(guestFormResponses.formId, formId))
      .orderBy(guestFormResponses.createdAt);

    return responses.map(mapFormResponse);
  }

  private async requireForm(eventId: string, formId: string): Promise<void> {
    const [form] = await this.db
      .select({ id: eventForms.id })
      .from(eventForms)
      .where(and(eq(eventForms.id, formId), eq(eventForms.eventId, eventId)))
      .limit(1);
    if (!form) throw new NotFoundError("Form not found");
  }
}

function mapForm(
  row: typeof eventForms.$inferSelect,
  fields: typeof eventFormFields.$inferSelect[]
): FormRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    fields: fields.sort((a, b) => a.position - b.position).map(mapFormField),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapFormField(row: typeof eventFormFields.$inferSelect): FormFieldRecord {
  return {
    id: row.id,
    formId: row.formId,
    name: row.name,
    kind: row.kind,
    position: row.position,
    content: row.content ?? null,
    isRequired: row.isRequired,
    description: row.description ?? null,
    details: row.details as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapFormResponse(
  row: typeof guestFormResponses.$inferSelect
): FormResponseRecord {
  return {
    id: row.id,
    formId: row.formId,
    eventGuestId: row.eventGuestId,
    answers: row.answers as Record<string, unknown>,
    metadata: row.metadata as Record<string, unknown>,
    isAdditionalGuest: row.isAdditionalGuest,
    comment: row.comment ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
