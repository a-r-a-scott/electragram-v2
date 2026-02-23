import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const designSchema = pgSchema("design");

const tsvector = customType<{ data: string }>({
  dataType() { return "tsvector"; },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const designStatusEnum = pgEnum("design_status", ["draft", "active", "archived"]);
export const themeKindEnum = pgEnum("theme_kind", ["invitation", "email", "event_page", "general"]);
export const templateKindEnum = pgEnum("template_kind", ["invitation", "email", "event_page", "rsvp_form", "general"]);
export const layerKindEnum = pgEnum("layer_kind", ["background", "foreground", "overlay", "text", "graphic", "border"]);
export const layerSideEnum = pgEnum("layer_side", ["front", "back"]);
export const fontKindEnum = pgEnum("font_kind", ["system", "google", "custom"]);
export const blockKindEnum = pgEnum("block_kind", ["section", "row", "column", "text", "image", "button", "divider", "spacer", "form_field"]);

// ─── Color Palettes ───────────────────────────────────────────────────────────

export const colorPalettes = designSchema.table(
  "color_palettes",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    primary: varchar("primary", { length: 20 }),
    secondary: varchar("secondary", { length: 20 }),
    tertiary: varchar("tertiary", { length: 20 }),
    backgroundPrimary: varchar("background_primary", { length: 20 }),
    backgroundSecondary: varchar("background_secondary", { length: 20 }),
    status: designStatusEnum("status").notNull().default("active"),
    shared: boolean("shared").notNull().default(true),
    position: integer("position").default(0),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("color_palettes_lookup_key_idx").on(t.lookupKey),
  ]
);

// ─── Fonts ────────────────────────────────────────────────────────────────────

export const fonts = designSchema.table(
  "fonts",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }),  // null = system font
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    kind: fontKindEnum("kind").notNull().default("system"),
    externalKey: varchar("external_key", { length: 255 }), // Google Fonts family name, etc.
    details: jsonb("details").notNull().default({}),        // variants, weights, CSS URL
    status: designStatusEnum("status").notNull().default("active"),
    shared: boolean("shared").notNull().default(true),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fonts_lookup_key_idx").on(t.lookupKey),
    index("fonts_account_idx").on(t.accountId),
  ]
);

// ─── Font Stacks ──────────────────────────────────────────────────────────────

export const fontStacks = designSchema.table(
  "font_stacks",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    primaryFontId: varchar("primary_font_id", { length: 26 }).notNull(),
    secondaryFontId: varchar("secondary_font_id", { length: 26 }),
    tertiaryFontId: varchar("tertiary_font_id", { length: 26 }),
    details: jsonb("details").notNull().default({}),
    status: designStatusEnum("status").notNull().default("active"),
    shared: boolean("shared").notNull().default(true),
    position: integer("position").default(0),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("font_stacks_lookup_key_idx").on(t.lookupKey),
    index("font_stacks_primary_font_idx").on(t.primaryFontId),
  ]
);

// ─── Graphics ─────────────────────────────────────────────────────────────────

export const graphics = designSchema.table(
  "graphics",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    svgBackground: text("svg_background"),
    svgChecksum: varchar("svg_checksum", { length: 64 }),
    svgColors: jsonb("svg_colors").notNull().default([]),
    details: jsonb("details").notNull().default({}),
    status: designStatusEnum("status").notNull().default("active"),
    shared: boolean("shared").notNull().default(false),
    position: integer("position").default(0),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("graphics_lookup_key_idx").on(t.lookupKey),
  ]
);

// ─── Themes ───────────────────────────────────────────────────────────────────

export const themes = designSchema.table(
  "themes",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: varchar("account_id", { length: 26 }),   // null = system/shared theme
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }),
    description: text("description"),
    kind: themeKindEnum("kind").notNull().default("invitation"),
    status: designStatusEnum("status").notNull().default("draft"),
    shared: boolean("shared").notNull().default(true),
    customized: boolean("customized").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    colorPaletteId: varchar("color_palette_id", { length: 26 }),
    fontStackId: varchar("font_stack_id", { length: 26 }),
    details: jsonb("details").notNull().default({}),
    dimensions: jsonb("dimensions").notNull().default([1400, 1400]),
    position: integer("position").default(0),
    lookupKey: varchar("lookup_key", { length: 100 }),
    searchText: tsvector("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("themes_lookup_key_idx").on(t.lookupKey),
    index("themes_account_idx").on(t.accountId),
    index("themes_kind_idx").on(t.kind),
    index("themes_search_idx").using("gin", t.searchText),
  ]
);

// ─── Theme Templates ──────────────────────────────────────────────────────────

export const themeTemplates = designSchema.table(
  "theme_templates",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    themeId: varchar("theme_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    kind: templateKindEnum("kind").notNull().default("email"),
    status: designStatusEnum("status").notNull().default("draft"),
    position: integer("position").default(0),
    // Email template fields
    subject: varchar("subject", { length: 500 }),
    preheader: varchar("preheader", { length: 255 }),
    bodyHtml: text("body_html"),                // full HTML template with {{variable}} placeholders
    bodyText: text("body_text"),                // plain-text fallback
    fromName: varchar("from_name", { length: 255 }),
    fromEmail: varchar("from_email", { length: 255 }),
    variableKeys: jsonb("variable_keys").notNull().default([]),
    details: jsonb("details").notNull().default({}),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("theme_templates_theme_lookup_idx").on(t.themeId, t.lookupKey),
    index("theme_templates_theme_idx").on(t.themeId),
    index("theme_templates_kind_idx").on(t.kind),
  ]
);

// ─── Theme Layers ─────────────────────────────────────────────────────────────

export const themeLayers = designSchema.table(
  "theme_layers",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    themeTemplateId: varchar("theme_template_id", { length: 26 }).notNull(),
    name: varchar("name", { length: 255 }),
    kind: layerKindEnum("kind").notNull().default("background"),
    side: layerSideEnum("side").notNull().default("front"),
    position: integer("position").default(0),
    svgBackground: text("svg_background"),
    svgChecksum: varchar("svg_checksum", { length: 64 }),
    svgColors: jsonb("svg_colors").notNull().default([]),
    dimensions: jsonb("dimensions"),        // [width, height]
    coordinates: jsonb("coordinates"),      // [top, left]
    details: jsonb("details").notNull().default({}),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("theme_layers_template_lookup_idx").on(t.themeTemplateId, t.lookupKey),
    index("theme_layers_template_idx").on(t.themeTemplateId),
  ]
);

// ─── Blocks ───────────────────────────────────────────────────────────────────

export const blocks = designSchema.table(
  "blocks",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    blockableType: varchar("blockable_type", { length: 100 }).notNull(),  // "theme_template", "event_page", etc.
    blockableId: varchar("blockable_id", { length: 26 }).notNull(),
    parentId: varchar("parent_id", { length: 26 }),
    kind: blockKindEnum("kind").notNull().default("section"),
    name: varchar("name", { length: 255 }),
    style: varchar("style", { length: 255 }).notNull().default("default"),
    position: integer("position").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    details: jsonb("details").notNull().default({}),
    // Form field properties
    fieldType: varchar("field_type", { length: 50 }),
    required: boolean("required").notNull().default(false),
    placeholder: varchar("placeholder", { length: 255 }).default(""),
    lookupKey: varchar("lookup_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("blocks_blockable_idx").on(t.blockableType, t.blockableId),
    index("blocks_parent_idx").on(t.parentId),
    uniqueIndex("blocks_blockable_lookup_idx").on(t.blockableType, t.blockableId, t.lookupKey),
  ]
);
