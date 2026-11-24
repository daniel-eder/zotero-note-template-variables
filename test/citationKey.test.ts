/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import { describe, expect, it } from "vitest";
import { resolveCitationKey, safeGetField } from "../src/citationKey";

describe("safeGetField", () => {
  it("returns trimmed string value when field exists", () => {
    const item = { getField: (f: string) => (f === "title" ? "  Test Title  " : "") };
    expect(safeGetField(item, "title")).toBe("Test Title");
  });

  it("returns empty string when item is null or getField throws", () => {
    expect(safeGetField(null, "title")).toBe("");
    expect(
      safeGetField(
        {
          getField: () => {
            throw new Error("Invalid field");
          },
        },
        "citationKey"
      )
    ).toBe("");
  });
});

describe("resolveCitationKey", () => {
  it("prefers native citationKey field when present", () => {
    const item = {
      id: 42,
      getField: (f: string) => (f === "citationKey" ? "smith2024native" : "Citation Key: other"),
    };
    const zotero = {
      BetterBibTeX: {
        KeyManager: {
          get: () => ({ citationKey: "bbtKey" }),
        },
      },
    };
    expect(resolveCitationKey(item, zotero)).toBe("smith2024native");
  });

  it("falls back to BetterBibTeX.KeyManager.get when native citationKey is empty", () => {
    const item = {
      id: 42,
      getField: () => "",
    };
    const zotero = {
      BetterBibTeX: {
        KeyManager: {
          get: (id: number) => (id === 42 ? { citationKey: "smith2024bbt" } : null),
        },
      },
    };
    expect(resolveCitationKey(item, zotero)).toBe("smith2024bbt");
  });

  it("falls back to Extra field Citation Key / bibtex / biblatex lines", () => {
    const item1 = {
      id: 1,
      getField: (f: string) => (f === "extra" ? "DOI: 10.1/2\nCitation Key: doe2023extra\n" : ""),
    };
    const item2 = {
      id: 2,
      getField: (f: string) => (f === "extra" ? "bibtex: roe2022bib" : ""),
    };
    expect(resolveCitationKey(item1)).toBe("doe2023extra");
    expect(resolveCitationKey(item2)).toBe("roe2022bib");
  });

  it("returns empty string when no citation key is found", () => {
    const item = { id: 99, getField: () => "" };
    expect(resolveCitationKey(item, {})).toBe("");
    expect(resolveCitationKey(null, {})).toBe("");
  });
});
