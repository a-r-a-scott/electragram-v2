import type { FastifyInstance } from "fastify";
import {
  ColorPalettesService,
  CreateColorPaletteSchema,
  UpdateColorPaletteSchema,
  ListColorPalettesQuerySchema,
} from "../services/color-palettes.service.js";

export async function registerColorPaletteRoutes(app: FastifyInstance, svc: ColorPalettesService) {
  app.get("/color-palettes", async (req, reply) => {
    const query = ListColorPalettesQuerySchema.parse(req.query);
    const result = await svc.list(query);
    return reply.send({ success: true, ...result });
  });

  app.post("/color-palettes", async (req, reply) => {
    const input = CreateColorPaletteSchema.parse(req.body);
    const palette = await svc.create(input);
    return reply.code(201).send({ success: true, data: palette });
  });

  app.get<{ Params: { paletteId: string } }>("/color-palettes/:paletteId", async (req, reply) => {
    const palette = await svc.get(req.params.paletteId);
    return reply.send({ success: true, data: palette });
  });

  app.patch<{ Params: { paletteId: string } }>("/color-palettes/:paletteId", async (req, reply) => {
    const input = UpdateColorPaletteSchema.parse(req.body);
    const palette = await svc.update(req.params.paletteId, input);
    return reply.send({ success: true, data: palette });
  });

  app.delete<{ Params: { paletteId: string } }>("/color-palettes/:paletteId", async (req, reply) => {
    await svc.delete(req.params.paletteId);
    return reply.code(204).send();
  });
}
