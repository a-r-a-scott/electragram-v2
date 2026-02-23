import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphicsService } from "../../src/services/graphics.service.js";
import { NotFoundError } from "../../src/services/errors.js";

function makeGraphicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "gfx_001",
    name: "Flower",
    description: "Decorative flower",
    svgBackground: "<svg></svg>",
    svgChecksum: "abc123",
    svgColors: ["#ff0000"],
    details: {},
    status: "active" as const,
    shared: false,
    position: 0,
    lookupKey: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeDb(row = makeGraphicRow()) {
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

describe("GraphicsService", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: GraphicsService;

  beforeEach(() => {
    db = makeDb();
    svc = new GraphicsService(db as any);
  });

  it("get returns graphic when found", async () => {
    const g = await svc.get("gfx_001");
    expect(g.id).toBe("gfx_001");
    expect(g.svgColors).toEqual(["#ff0000"]);
  });

  it("get throws NotFoundError when not found", async () => {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    db.select = vi.fn(() => chain);
    await expect(svc.get("missing")).rejects.toThrow(NotFoundError);
  });

  it("create inserts and returns graphic", async () => {
    const g = await svc.create({ name: "Flower", svgColors: [], details: {}, shared: false });
    expect(g).toBeDefined();
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("update calls db.update", async () => {
    await svc.update("gfx_001", { name: "Rose" });
    expect(db.update).toHaveBeenCalledOnce();
  });

  it("delete calls db.delete", async () => {
    await svc.delete("gfx_001");
    expect(db.delete).toHaveBeenCalledOnce();
  });
});
