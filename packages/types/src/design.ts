import type { Timestamps } from "./common.js";

export interface Theme extends Timestamps {
  id: string;
  name: string;
  description: string | null;
  lookupKey: string;
  parentId: string | null;
  status: string;
  kind: string;
  isCustomized: boolean;
  isLocked: boolean;
  colorPaletteId: string | null;
  fontStackId: string | null;
  dimensions: Record<string, unknown>;
}

export interface Block extends Timestamps {
  id: string;
  blockableType: string;
  blockableId: string;
  parentId: string | null;
  kind: string;
  name: string | null;
  position: number;
  style: string | null;
  details: Record<string, unknown>;
  lookupKey: string | null;
  isVisible: boolean;
  fieldType: string | null;
  isRequired: boolean;
  placeholder: string | null;
}
