import { describe, it, expect } from "vitest";
import {
  RendererService,
  buildCssVariables,
  wrapInEmailSkeleton,
  type TemplateDesignContext,
} from "../../src/services/renderer.service.js";
import { interpolate, extractVariableKeys } from "../../src/utils/id.js";

// ── CSS variable builder ──────────────────────────────────────────────────────

describe("buildCssVariables", () => {
  it("uses palette values when provided", () => {
    const vars = buildCssVariables(
      {
        primary: "#ff0000",
        secondary: "#00ff00",
        tertiary: "#0000ff",
        backgroundPrimary: "#ffffff",
        backgroundSecondary: "#eeeeee",
      },
      { primaryFamily: "Georgia, serif", secondaryFamily: "Arial, sans-serif" }
    );
    expect(vars.colorPrimary).toBe("#ff0000");
    expect(vars.colorBgPrimary).toBe("#ffffff");
    expect(vars.fontPrimary).toBe("Georgia, serif");
    expect(vars.fontSecondary).toBe("Arial, sans-serif");
  });

  it("falls back to defaults when palette is null", () => {
    const vars = buildCssVariables(null, null);
    expect(vars.colorPrimary).toBe("#1a1a1a");
    expect(vars.colorBgPrimary).toBe("#ffffff");
    expect(vars.fontPrimary).toBe("Georgia, serif");
    expect(vars.fontSecondary).toBe("Arial, sans-serif");
  });

  it("falls back font family when fontStack is null", () => {
    const vars = buildCssVariables(null, null);
    expect(vars.fontPrimary).toBe("Georgia, serif");
  });
});

// ── Email skeleton wrapper ────────────────────────────────────────────────────

describe("wrapInEmailSkeleton", () => {
  it("wraps body HTML in valid HTML document structure", () => {
    const vars = buildCssVariables(null, null);
    const html = wrapInEmailSkeleton("<p>Hello</p>", vars, "Test Subject");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
    expect(html).toContain("<p>Hello</p>");
  });

  it("injects CSS custom properties", () => {
    const vars = buildCssVariables(
      { primary: "#cc0000", secondary: null, tertiary: null, backgroundPrimary: null, backgroundSecondary: null },
      null
    );
    const html = wrapInEmailSkeleton("", vars, "");
    expect(html).toContain("--color-primary: #cc0000");
  });

  it("escapes HTML special chars in title", () => {
    const vars = buildCssVariables(null, null);
    const html = wrapInEmailSkeleton("", vars, "Event <Party> & Fun");
    expect(html).toContain("Event &lt;Party&gt; &amp; Fun");
  });

  it("sets max-width 600px email wrapper", () => {
    const vars = buildCssVariables(null, null);
    const html = wrapInEmailSkeleton("", vars, "");
    expect(html).toContain("max-width: 600px");
  });
});

// ── RendererService.renderContext (pure, no DB) ───────────────────────────────

function makeCtx(overrides: Partial<TemplateDesignContext> = {}): TemplateDesignContext {
  return {
    id: "tpl_1",
    name: "Welcome Email",
    subject: "Hello {{firstName}}!",
    preheader: "We're glad you're here",
    bodyHtml: "<p>Dear {{firstName}} {{lastName}},</p><p>Welcome to {{accountName}}.</p>",
    bodyText: "Dear {{firstName}} {{lastName}}, welcome to {{accountName}}.",
    fromName: "Electragram",
    fromEmail: "hello@electragram.io",
    variableKeys: ["firstName", "lastName", "accountName"],
    colorPalette: null,
    fontStack: null,
    ...overrides,
  };
}

describe("RendererService.renderContext", () => {
  // renderContext is a pure method; instantiate with a fake DB to call it
  const renderer = new RendererService(null as any);

  it("interpolates variables into subject", () => {
    const result = renderer.renderContext(makeCtx(), {
      variables: { firstName: "Alice", lastName: "Smith", accountName: "Acme" },
      preview: false,
    });
    expect(result.subject).toBe("Hello Alice!");
  });

  it("interpolates variables into bodyHtml", () => {
    const result = renderer.renderContext(makeCtx(), {
      variables: { firstName: "Alice", lastName: "Smith", accountName: "Acme" },
      preview: false,
    });
    expect(result.html).toContain("Dear Alice Smith");
  });

  it("interpolates variables into bodyText", () => {
    const result = renderer.renderContext(makeCtx(), {
      variables: { firstName: "Bob", lastName: "Jones", accountName: "Corp" },
      preview: false,
    });
    expect(result.bodyText).toBe("Dear Bob Jones, welcome to Corp.");
  });

  it("returns preheader and fromName/Email", () => {
    const result = renderer.renderContext(makeCtx(), { variables: {}, preview: false });
    expect(result.preheader).toBe("We're glad you're here");
    expect(result.fromName).toBe("Electragram");
    expect(result.fromEmail).toBe("hello@electragram.io");
  });

  it("reports missing variables", () => {
    const result = renderer.renderContext(makeCtx(), {
      variables: { firstName: "Alice" }, // lastName + accountName missing
      preview: false,
    });
    expect(result.missingVariables).toContain("lastName");
    expect(result.missingVariables).toContain("accountName");
    expect(result.missingVariables).not.toContain("firstName");
  });

  it("returns no missing variables when all provided", () => {
    const result = renderer.renderContext(makeCtx(), {
      variables: { firstName: "Alice", lastName: "S", accountName: "Corp" },
      preview: false,
    });
    expect(result.missingVariables).toHaveLength(0);
  });

  it("skips interpolation in preview mode", () => {
    const result = renderer.renderContext(makeCtx(), {
      variables: { firstName: "Alice", lastName: "S", accountName: "Corp" },
      preview: true,
    });
    // In preview mode vars is {}, so placeholders remain
    expect(result.subject).toContain("{{firstName}}");
  });

  it("handles null bodyHtml gracefully", () => {
    const ctx = makeCtx({ bodyHtml: null });
    const result = renderer.renderContext(ctx, { variables: {}, preview: false });
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).not.toContain("null");
  });

  it("applies color palette CSS vars in HTML output", () => {
    const ctx = makeCtx({
      colorPalette: {
        primary: "#abcdef",
        secondary: null, tertiary: null, backgroundPrimary: null, backgroundSecondary: null,
      },
    });
    const result = renderer.renderContext(ctx, { variables: {}, preview: false });
    expect(result.html).toContain("--color-primary: #abcdef");
  });

  it("applies font stack CSS vars in HTML output", () => {
    const ctx = makeCtx({ fontStack: { primaryFamily: "Lato, sans-serif", secondaryFamily: null } });
    const result = renderer.renderContext(ctx, { variables: {}, preview: false });
    expect(result.html).toContain("Lato, sans-serif");
  });

  it("handles empty variableKeys list", () => {
    const ctx = makeCtx({ variableKeys: [], bodyHtml: "<p>Static content</p>", subject: "Static subject" });
    const result = renderer.renderContext(ctx, { variables: {}, preview: false });
    expect(result.missingVariables).toHaveLength(0);
    expect(result.subject).toBe("Static subject");
  });
});

// ── interpolate util ──────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("replaces known placeholders", () => {
    expect(interpolate("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("replaces with empty string for null value", () => {
    expect(interpolate("Hello {{name}}!", { name: null })).toBe("Hello !");
  });

  it("replaces with empty string for missing key", () => {
    expect(interpolate("Hello {{name}}!", {})).toBe("Hello !");
  });

  it("handles whitespace around variable names", () => {
    expect(interpolate("{{ firstName }}", { firstName: "Alice" })).toBe("Alice");
  });

  it("replaces multiple occurrences", () => {
    expect(interpolate("{{a}} and {{a}}", { a: "X" })).toBe("X and X");
  });

  it("handles no placeholders", () => {
    expect(interpolate("No placeholders here.", {})).toBe("No placeholders here.");
  });
});

// ── extractVariableKeys util ──────────────────────────────────────────────────

describe("extractVariableKeys", () => {
  it("extracts variable names", () => {
    expect(extractVariableKeys("Hello {{name}} from {{place}}")).toEqual(
      expect.arrayContaining(["name", "place"])
    );
  });

  it("deduplicates", () => {
    const keys = extractVariableKeys("{{a}} {{a}} {{b}}");
    expect(keys.filter((k) => k === "a")).toHaveLength(1);
  });

  it("returns empty array for no matches", () => {
    expect(extractVariableKeys("No variables here")).toHaveLength(0);
  });
});
