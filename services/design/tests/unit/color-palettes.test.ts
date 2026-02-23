import { describe, it, expect, vi, beforeEach } from "vitest";
import { ColorPalettesService } from "../../src/services/color-palettes.service.js";
import { NotFoundError } from "../../src/services/errors.js";

function makePaletteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pal_abc",
    name: "Ocean Blue",
    description: "Cool blue palette",
    primary: "#003366",
    secondary: "#0055aa",
    tertiary: "#0077cc",
    backgroundPrimary: "#ffffff",
    backgroundSecondary: "#f0f8ff",
    status: "active" as const,
    shared: true,
    position: 0,
    lookupKey: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeDb(row = makePaletteRow()) {
  const selectChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([row]),
    offset: vi.fn().mockResolvedValue([row]),
  };
  const countChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: 1 }]),
  };
  const insertChain: any = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  const updateChain: any = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  const deleteChain: any = { where: vi.fn().mockResolvedValue(undefined) };

  return {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
  };
}

describe("ColorPalettesService", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: ColorPalettesService;

  beforeEach(() => {
    db = makeDb();
    svc = new ColorPalettesService(db as any);
  });

  describe("get", () => {
    it("returns palette when found", async () => {
      const p = await svc.get("pal_abc");
      expect(p.id).toBe("pal_abc");
      expect(p.primary).toBe("#003366");
    });

    it("throws NotFoundError when not found", async () => {
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      db.select = vi.fn(() => chain);
      await expect(svc.get("missing")).rejects.toThrow(NotFoundError);
    });
  });

  describe("create", () => {
    it("creates palette and returns record", async () => {
      const p = await svc.create({ name: "Ocean Blue", primary: "#003366", shared: true });
      expect(p.name).toBe("Ocean Blue");
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("update", () => {
    it("updates and returns record", async () => {
      const p = await svc.update("pal_abc", { name: "Deep Blue" });
      expect(p).toBeDefined();
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("delete", () => {
    it("deletes the palette", async () => {
      await svc.delete("pal_abc");
      expect(db.delete).toHaveBeenCalledOnce();
    });
  });
});
