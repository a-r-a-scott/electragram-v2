import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemesService } from "../../src/services/themes.service.js";
import { NotFoundError } from "../../src/services/errors.js";

// ── Mock DB factory ───────────────────────────────────────────────────────────

function makeThemeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "thm_abc123",
    accountId: "acc_1",
    name: "Summer Vibes",
    title: "Summer",
    description: "A warm theme",
    kind: "invitation" as const,
    status: "draft" as const,
    shared: false,
    customized: false,
    locked: false,
    colorPaletteId: null,
    fontStackId: null,
    details: {},
    dimensions: [1400, 1400],
    position: 0,
    lookupKey: null,
    searchText: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  const row = makeThemeRow();
  const selectChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([row]),
    offset: vi.fn().mockReturnThis(),
  };
  // select().from().where().orderBy().limit().offset() → rows
  selectChain.offset = vi.fn().mockResolvedValue([row]);

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
  const deleteChain: any = {
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
    ...overrides,
  };
}

// ── ThemesService unit tests ──────────────────────────────────────────────────

describe("ThemesService", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: ThemesService;

  beforeEach(() => {
    db = makeDb();
    svc = new ThemesService(db as any);
  });

  describe("get", () => {
    it("returns a theme record when found", async () => {
      const theme = await svc.get("thm_abc123");
      expect(theme.id).toBe("thm_abc123");
      expect(theme.name).toBe("Summer Vibes");
      expect(theme.kind).toBe("invitation");
    });

    it("throws NotFoundError when not found", async () => {
      const selectChain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      db.select = vi.fn(() => selectChain);
      await expect(svc.get("nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("create", () => {
    it("creates a theme and returns it", async () => {
      const theme = await svc.create("acc_1", {
        name: "Summer Vibes",
        kind: "invitation",
        details: {},
        dimensions: [1400, 1400],
        shared: false,
      });
      expect(theme.name).toBe("Summer Vibes");
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("update", () => {
    it("updates and returns updated theme", async () => {
      const theme = await svc.update("thm_abc123", { name: "Autumn Vibes" });
      expect(theme).toBeDefined();
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("publish", () => {
    it("calls update with status=active", async () => {
      await svc.publish("thm_abc123");
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("archive", () => {
    it("calls update with status=archived", async () => {
      await svc.archive("thm_abc123");
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("delete", () => {
    it("calls delete on the DB", async () => {
      await svc.delete("thm_abc123");
      expect(db.delete).toHaveBeenCalledOnce();
    });
  });

  describe("list", () => {
    it("returns paginated themes", async () => {
      // list calls select twice (data + count) so we need both to work
      let callCount = 0;
      const selectData: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([makeThemeRow()]),
      };
      const selectCount: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      };
      db.select = vi.fn(() => {
        callCount++;
        // First call is data (has orderBy+limit+offset), second is count
        return callCount === 1 ? selectData : selectCount;
      });

      const result = await svc.list("acc_1", { page: 1, perPage: 25 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
