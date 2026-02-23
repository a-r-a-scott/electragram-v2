import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlocksService } from "../../src/services/blocks.service.js";
import { NotFoundError } from "../../src/services/errors.js";

function makeBlockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "blk_001",
    blockableType: "theme_template",
    blockableId: "tpl_001",
    parentId: null,
    kind: "section" as const,
    name: "Hero Section",
    style: "default",
    position: 0,
    visible: true,
    details: {},
    fieldType: null,
    required: false,
    placeholder: "",
    lookupKey: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeDb(row = makeBlockRow()) {
  const selectChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([row]),
    limit: vi.fn().mockResolvedValue([row]),
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

describe("BlocksService", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: BlocksService;

  beforeEach(() => {
    db = makeDb();
    svc = new BlocksService(db as any);
  });

  describe("list", () => {
    it("returns blocks for a blockable", async () => {
      const rows = await svc.list("theme_template", "tpl_001");
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  describe("get", () => {
    it("returns block when found", async () => {
      const block = await svc.get("blk_001");
      expect(block.id).toBe("blk_001");
      expect(block.kind).toBe("section");
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
    it("creates and returns a block", async () => {
      const block = await svc.create({
        blockableType: "theme_template",
        blockableId: "tpl_001",
        kind: "section",
        style: "default",
        position: 0,
        visible: true,
        details: {},
        required: false,
        placeholder: "",
      });
      expect(block.blockableType).toBe("theme_template");
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("update", () => {
    it("updates and returns the block", async () => {
      const block = await svc.update("blk_001", { name: "Updated Hero" });
      expect(block).toBeDefined();
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("delete", () => {
    it("deletes the block", async () => {
      await svc.delete("blk_001");
      expect(db.delete).toHaveBeenCalledOnce();
    });
  });

  describe("reorder", () => {
    it("issues one update per id", async () => {
      await svc.reorder(["blk_001", "blk_002", "blk_003"]);
      expect(db.update).toHaveBeenCalledTimes(3);
    });

    it("handles empty list without error", async () => {
      await svc.reorder([]);
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
