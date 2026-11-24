/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

export interface CitationKeyItemLike {
  id?: number;
  getField?(field: string): unknown;
}

export interface BetterBibTeXLike {
  KeyManager?: {
    get?(itemID: number): { citationKey?: string; citekey?: string } | null | undefined;
  };
}

export interface CitationKeyZoteroLike {
  BetterBibTeX?: BetterBibTeXLike;
}

/**
 * Safely read a field from a Zotero item, returning "" if missing or throwing.
 */
export function safeGetField(
  item: CitationKeyItemLike | null | undefined,
  field: string
): string {
  if (!item || !field || typeof item.getField !== "function") {
    return "";
  }
  try {
    const val = item.getField(field);
    return val == null ? "" : String(val).trim();
  } catch {
    return "";
  }
}

/**
 * Resolve the citation key for a parent Zotero item using:
 * 1. Native `citationKey` field (Zotero 8–11 / Better BibTeX 9+)
 * 2. Better BibTeX KeyManager (`Zotero.BetterBibTeX.KeyManager.get(item.id)`)
 * 3. `Extra` field (`Citation Key:`, `bibtex:`, or `biblatex:`)
 */
export function resolveCitationKey(
  parentItem: CitationKeyItemLike | null | undefined,
  zotero?: CitationKeyZoteroLike | null
): string {
  if (!parentItem) {
    return "";
  }

  const nativeKey = safeGetField(parentItem, "citationKey");
  if (nativeKey) {
    return nativeKey;
  }

  if (typeof parentItem.id === "number") {
    try {
      const bbtEntry = zotero?.BetterBibTeX?.KeyManager?.get?.(parentItem.id);
      const bbtKey = bbtEntry?.citationKey || bbtEntry?.citekey;
      if (typeof bbtKey === "string" && bbtKey.trim()) {
        return bbtKey.trim();
      }
    } catch {
      // Ignore BBT lookup errors and fall back to Extra field
    }
  }

  const extra = safeGetField(parentItem, "extra");
  if (extra) {
    const match = extra.match(/^\s*(?:citation\s*key|bibtex|biblatex)\s*:\s*(\S+)/im);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}
