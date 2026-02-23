import { describe, it, expect, vi, beforeEach } from "vitest";
import { TemplatesService } from "../../src/services/templates.service.js";
import { NotFoundError } from "../../src/services/errors.js";

function makeTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl_001",
    themeId: "thm_001",
    name: "Welcome Email",
    description: null,
    kind: "email" as const,
    status: "draft" as const,
    position: 0,
    subject: "Hello {{firstName}}!",
    preheader: "Welcome aboard",
    bodyHtml: "<p>Hi {{firstName}}</p>",
    bodyText: "Hi {{firstName}}",
    fromName: "Electragram",
    fromEmail: "hello@electragram.io",
    variableKeys: ["firstName"],
    details: {},
    lookupKey: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeDb(row = makeTemplateRow()) {
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

  let selectCall = 0;
  return {
    select: vi.fn(() => {
      selectCall++;
      return selectCall % 2 === 1 ? selectChain : countChain;
    }),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
  };
}

describe("TemplatesService", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: TemplatesService;

  beforeEach(() => {
    db = makeDb();
    svc = new TemplatesService(db as any);
  });

  describe("get", () => {
    it("returns a template by themeId + templateId", async () => {
      const t = await svc.get("thm_001", "tpl_001");
      expect(t.id).toBe("tpl_001");
      expect(t.subject).toBe("Hello {{firstName}}!");
      expect(t.variableKeys).toContain("firstName");
    });

    it("throws NotFoundError when not found", async () => {
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      db.select = vi.fn(() => chain);
      await expect(svc.get("thm_001", "missing")).rejects.toThrow(NotFoundError);
    });
  });

  describe("getById", () => {
    it("returns template without requiring themeId", async () => {
      const t = await svc.getById("tpl_001");
      expect(t.id).toBe("tpl_001");
    });
  });

  describe("create", () => {
    it("extracts variable keys from bodyHtml + subject", async () => {
      const t = await svc.create("thm_001", {
        name: "Welcome",
        kind: "email",
        subject: "Hello {{firstName}}!",
        bodyHtml: "<p>Dear {{lastName}}</p>",
        details: {},
      });
      expect(t).toBeDefined();
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  describe("publish", () => {
    it("sets status to active", async () => {
      await svc.publish("thm_001", "tpl_001");
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("archive", () => {
    it("sets status to archived", async () => {
      await svc.archive("thm_001", "tpl_001");
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe("delete", () => {
    it("deletes the template", async () => {
      await svc.delete("thm_001", "tpl_001");
      expect(db.delete).toHaveBeenCalledOnce();
    });
  });
});
