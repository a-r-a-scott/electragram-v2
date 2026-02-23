import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { themeTemplates, themes, colorPalettes, fontStacks, fonts } from "../db/schema.js";
import { interpolate, extractVariableKeys } from "../utils/id.js";
import { NotFoundError, ValidationError } from "./errors.js";

export const RenderTemplateSchema = z.object({
  variables: z.record(z.string().or(z.null())).default({}),
  /** If true, returns the rendered HTML without applying variable interpolation (preview mode). */
  preview: z.boolean().default(false),
});

export type RenderTemplateInput = z.infer<typeof RenderTemplateSchema>;

export interface RenderResult {
  html: string;
  subject: string;
  preheader: string;
  bodyText: string;
  fromName: string;
  fromEmail: string;
  /** Variables referenced in the template that were not provided in input. */
  missingVariables: string[];
}

/** Full denormalised view of a template + its design context. */
interface TemplateDesignContext {
  id: string;
  name: string;
  subject: string | null;
  preheader: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  fromName: string | null;
  fromEmail: string | null;
  variableKeys: string[];
  colorPalette: {
    primary: string | null;
    secondary: string | null;
    tertiary: string | null;
    backgroundPrimary: string | null;
    backgroundSecondary: string | null;
  } | null;
  fontStack: {
    primaryFamily: string | null;
    secondaryFamily: string | null;
  } | null;
}

export class RendererService {
  constructor(private readonly db: Db) {}

  /**
   * Render a theme template as fully-inlined email HTML.
   *
   * Called by the Delivery service at cold-start to personalise each email
   * just before sending. Performance target: < 200ms p99.
   */
  async render(templateId: string, input: RenderTemplateInput): Promise<RenderResult> {
    const ctx = await this.loadContext(templateId);
    return this.renderContext(ctx, input);
  }

  /** Load the template + associated theme + palette + font stack in one round-trip. */
  private async loadContext(templateId: string): Promise<TemplateDesignContext> {
    const [row] = await this.db
      .select()
      .from(themeTemplates)
      .where(eq(themeTemplates.id, templateId))
      .limit(1);

    if (!row) throw new NotFoundError("Template not found");

    // Load theme (optional — template may exist without a full design theme)
    let palette: TemplateDesignContext["colorPalette"] = null;
    let stack: TemplateDesignContext["fontStack"] = null;

    if (row.themeId) {
      const [themeRow] = await this.db
        .select()
        .from(themes)
        .where(eq(themes.id, row.themeId))
        .limit(1);

      if (themeRow) {
        if (themeRow.colorPaletteId) {
          const [palRow] = await this.db
            .select()
            .from(colorPalettes)
            .where(eq(colorPalettes.id, themeRow.colorPaletteId))
            .limit(1);
          if (palRow) {
            palette = {
              primary: palRow.primary ?? null,
              secondary: palRow.secondary ?? null,
              tertiary: palRow.tertiary ?? null,
              backgroundPrimary: palRow.backgroundPrimary ?? null,
              backgroundSecondary: palRow.backgroundSecondary ?? null,
            };
          }
        }

        if (themeRow.fontStackId) {
          const [stackRow] = await this.db
            .select()
            .from(fontStacks)
            .where(eq(fontStacks.id, themeRow.fontStackId))
            .limit(1);

          if (stackRow) {
            // Resolve the primary font's display name for the CSS font-family
            const [primaryFont] = await this.db
              .select()
              .from(fonts)
              .where(eq(fonts.id, stackRow.primaryFontId))
              .limit(1);

            let secondaryFamily: string | null = null;
            if (stackRow.secondaryFontId) {
              const [secondaryFont] = await this.db
                .select()
                .from(fonts)
                .where(eq(fonts.id, stackRow.secondaryFontId))
                .limit(1);
              secondaryFamily = secondaryFont?.externalKey ?? secondaryFont?.name ?? null;
            }

            stack = {
              primaryFamily: primaryFont?.externalKey ?? primaryFont?.name ?? null,
              secondaryFamily,
            };
          }
        }
      }
    }

    return {
      id: row.id,
      name: row.name,
      subject: row.subject ?? null,
      preheader: row.preheader ?? null,
      bodyHtml: row.bodyHtml ?? null,
      bodyText: row.bodyText ?? null,
      fromName: row.fromName ?? null,
      fromEmail: row.fromEmail ?? null,
      variableKeys: row.variableKeys as string[],
      colorPalette: palette,
      fontStack: stack,
    };
  }

  /** Pure rendering logic — separated for unit testability. */
  renderContext(ctx: TemplateDesignContext, input: RenderTemplateInput): RenderResult {
    const vars = input.variables as Record<string, string | null>;

    // Identify missing variables (in template but not in vars)
    const missingVariables = ctx.variableKeys.filter(
      (k) => !(k in vars) || vars[k] == null
    );

    // Build CSS custom properties from color palette + font stack
    const cssVars = buildCssVariables(ctx.colorPalette, ctx.fontStack);

    // Wrap body HTML in a minimal email skeleton with CSS variables applied
    const rawHtml = ctx.bodyHtml ?? "";
    const skeletonHtml = wrapInEmailSkeleton(rawHtml, cssVars, ctx.subject ?? "");

    // In preview mode, skip variable interpolation so placeholders remain visible.
    const apply = (s: string) => (input.preview ? s : interpolate(s, vars));

    const html = apply(skeletonHtml);
    const subject = apply(ctx.subject ?? "");
    const preheader = apply(ctx.preheader ?? "");
    const bodyText = apply(ctx.bodyText ?? "");

    return {
      html,
      subject,
      preheader,
      bodyText,
      fromName: ctx.fromName ?? "",
      fromEmail: ctx.fromEmail ?? "",
      missingVariables,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface CssVars {
  colorPrimary: string;
  colorSecondary: string;
  colorTertiary: string;
  colorBgPrimary: string;
  colorBgSecondary: string;
  fontPrimary: string;
  fontSecondary: string;
}

function buildCssVariables(
  palette: TemplateDesignContext["colorPalette"],
  fontStack: TemplateDesignContext["fontStack"]
): CssVars {
  return {
    colorPrimary: palette?.primary ?? "#1a1a1a",
    colorSecondary: palette?.secondary ?? "#4a4a4a",
    colorTertiary: palette?.tertiary ?? "#888888",
    colorBgPrimary: palette?.backgroundPrimary ?? "#ffffff",
    colorBgSecondary: palette?.backgroundSecondary ?? "#f8f8f8",
    fontPrimary: fontStack?.primaryFamily ?? "Georgia, serif",
    fontSecondary: fontStack?.secondaryFamily ?? "Arial, sans-serif",
  };
}

/**
 * Wraps email body HTML in a standards-compliant email skeleton with inlined
 * CSS custom properties. Compatible with major email clients.
 */
function wrapInEmailSkeleton(bodyHtml: string, vars: CssVars, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --color-primary: ${vars.colorPrimary};
      --color-secondary: ${vars.colorSecondary};
      --color-tertiary: ${vars.colorTertiary};
      --color-bg-primary: ${vars.colorBgPrimary};
      --color-bg-secondary: ${vars.colorBgSecondary};
      --font-primary: ${vars.fontPrimary};
      --font-secondary: ${vars.fontSecondary};
    }
    body {
      margin: 0; padding: 0;
      background-color: ${vars.colorBgSecondary};
      font-family: ${vars.fontPrimary};
      color: ${vars.colorPrimary};
      -webkit-text-size-adjust: 100%;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: ${vars.colorBgPrimary};
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Export for testing
export { buildCssVariables, wrapInEmailSkeleton, type TemplateDesignContext };
