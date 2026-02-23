import type { FastifyInstance } from "fastify";
import {
  FormsService,
  CreateFormSchema,
  UpdateFormSchema,
  UpdateFormFieldsSchema,
  SubmitFormResponseSchema,
} from "../services/forms.service.js";

export async function registerFormRoutes(
  app: FastifyInstance,
  formsService: FormsService
) {
  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId/forms",
    async (request, reply) => {
      const forms = await formsService.listForms(request.params.eventId);
      return reply.send({ success: true, data: forms });
    }
  );

  app.post<{ Params: { eventId: string } }>(
    "/events/:eventId/forms",
    async (request, reply) => {
      const input = CreateFormSchema.parse(request.body);
      const form = await formsService.createForm(request.params.eventId, input);
      return reply.code(201).send({ success: true, data: form });
    }
  );

  app.get<{ Params: { eventId: string; formId: string } }>(
    "/events/:eventId/forms/:formId",
    async (request, reply) => {
      const form = await formsService.getForm(
        request.params.eventId,
        request.params.formId
      );
      return reply.send({ success: true, data: form });
    }
  );

  app.patch<{ Params: { eventId: string; formId: string } }>(
    "/events/:eventId/forms/:formId",
    async (request, reply) => {
      const input = UpdateFormSchema.parse(request.body);
      const form = await formsService.updateForm(
        request.params.eventId,
        request.params.formId,
        input
      );
      return reply.send({ success: true, data: form });
    }
  );

  app.put<{ Params: { eventId: string; formId: string } }>(
    "/events/:eventId/forms/:formId/fields",
    async (request, reply) => {
      const input = UpdateFormFieldsSchema.parse(request.body);
      const form = await formsService.updateFormFields(
        request.params.eventId,
        request.params.formId,
        input
      );
      return reply.send({ success: true, data: form });
    }
  );

  app.delete<{ Params: { eventId: string; formId: string } }>(
    "/events/:eventId/forms/:formId",
    async (request, reply) => {
      await formsService.deleteForm(
        request.params.eventId,
        request.params.formId
      );
      return reply.code(204).send();
    }
  );

  app.get<{ Params: { eventId: string; formId: string } }>(
    "/events/:eventId/forms/:formId/responses",
    async (request, reply) => {
      const responses = await formsService.getFormResponses(
        request.params.eventId,
        request.params.formId
      );
      return reply.send({ success: true, data: responses });
    }
  );

  app.post<{
    Params: { eventId: string; formId: string; eventGuestId: string };
  }>(
    "/events/:eventId/guests/:eventGuestId/forms/:formId/response",
    async (request, reply) => {
      const input = SubmitFormResponseSchema.parse(request.body);
      const response = await formsService.submitFormResponse(
        request.params.eventId,
        request.params.formId,
        request.params.eventGuestId,
        input
      );
      return reply.code(201).send({ success: true, data: response });
    }
  );
}
