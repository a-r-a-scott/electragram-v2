import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  12
);

export function generateId(prefix: string): string {
  return `${prefix}_${nanoid()}`;
}

export function buildSearchText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Replace {{variable}} placeholders with values from a data map. */
export function interpolate(
  template: string,
  data: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{(\s*\w+\s*)\}\}/g, (_, key: string) => {
    const value = data[key.trim()];
    return value ?? "";
  });
}

/** Extract all {{variable}} keys from a template string. */
export function extractVariableKeys(template: string): string[] {
  const matches = template.matchAll(/\{\{(\s*\w+\s*)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]!.trim()))];
}
