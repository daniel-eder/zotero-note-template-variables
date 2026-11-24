/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import { describe, expect, it } from "vitest";
import {
  installAnnotationTemplatePatch,
  type CitationItemLike,
  type PatchAnnotationInput,
  type PatchZoteroLike,
  type SerializedAnnotationsResult,
} from "../src/patch";
import { templateUsesExtendedVars, type TemplateVarValue } from "../src/variables";

/**
 * Minimal faithful implementation of Zotero's `generateHTMLFromTemplate`
 * matching `chrome/content/zotero/modules/templates.mjs` (throws on non-string
 * variable values, supports `if`/`elseif`/`else`/`endif`, attributes, and
 * hyphen-to-camelCase identifiers).
 */
function zoteroGenerateHTMLFromTemplate(
  template: string,
  vars: Record<string, TemplateVarValue>
): string {
  const hyphenToCamel = (name: string) =>
    name.replace(/-(.)/g, (_, g1: string) => g1.toUpperCase());

  const getAttributes = (part: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const re = /([\w-]*) *=+ *(?:"([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(part))) {
      attrs[hyphenToCamel(m[1])] = m[2] ?? m[3];
    }
    return attrs;
  };

  const evaluateIdentifier = (ident: string, args: Record<string, string> = {}): string => {
    const key = hyphenToCamel(ident);
    if (!(key in vars)) {
      return "";
    }
    const raw = vars[key];
    const val = typeof raw === "function" ? raw(args) : raw;
    if (typeof val !== "string") {
      throw new Error(`Identifier "${key}" does not evaluate to a string`);
    }
    return val;
  };

  const evaluateCondition = (cond: string): boolean => {
    const trimmed = cond.trim();
    if (!trimmed) {
      return false;
    }
    const eqMatch = trimmed.match(/^(\w[\w-]*)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)")$/);
    if (eqMatch) {
      const val = evaluateIdentifier(eqMatch[1]).toLowerCase();
      const rhs = (eqMatch[3] ?? eqMatch[4] ?? "").toLowerCase();
      return eqMatch[2] === "==" ? val === rhs : val !== rhs;
    }
    return Boolean(evaluateIdentifier(trimmed));
  };

  const parts = template.split(/(\{\{[\s\S]*?\}\})/g);
  const levels: Array<{ condition: boolean; executed?: boolean; parentCondition?: boolean }> = [
    { condition: true },
  ];
  let html = "";

  for (const part of parts) {
    if (!part) continue;
    let level = levels[levels.length - 1];
    if (part.startsWith("{{") && part.endsWith("}}")) {
      const inner = part.slice(2, -2).trim();
      const operator = inner.split(/\s+/, 1)[0];
      const args = inner.slice(operator.length).trim();
      if (operator === "if") {
        level = { condition: false, executed: false, parentCondition: level.condition };
        levels.push(level);
      }
      if (operator === "if" || operator === "elseif") {
        if (!level.executed) {
          level.condition = Boolean(level.parentCondition && evaluateCondition(args));
          level.executed = level.condition;
        } else {
          level.condition = false;
        }
        continue;
      }
      if (operator === "else") {
        level.condition = Boolean(level.parentCondition && !level.executed);
        level.executed = level.condition;
        continue;
      }
      if (operator === "endif") {
        if (levels.length > 1) levels.pop();
        continue;
      }
      if (level.condition) {
        html += evaluateIdentifier(operator, getAttributes(args));
      }
    } else if (level.condition) {
      html += part;
    }
  }
  return html;
}

function createMockZotero(initialTemplate: string) {
  const prefs: Record<string, unknown> = {
    "annotations.noteTemplates.highlight": initialTemplate,
    "annotations.noteTemplates.note": "<p>{{citation}} {{comment}}</p>",
  };

  const parentItem = {
    id: 100,
    key: "PARENT1",
    libraryID: 1,
    library: { libraryType: "user" },
    getField: (field: string) => {
      switch (field) {
        case "citationKey":
          return "";
        case "title":
          return "A Great Paper";
        case "date":
          return "2024-05-01";
        case "DOI":
          return "10.1000/test";
        default:
          return "";
      }
    },
    getCreators: () => [{ firstName: "Jane", lastName: "Smith" }],
  };

  const attachmentItem = {
    id: 200,
    key: "ATTKEY1",
    parentID: 100,
    libraryID: 1,
    library: { libraryType: "user" },
  };

  const zotero: PatchZoteroLike = {
    Prefs: {
      get: (pref: string) => prefs[pref],
    },
    Items: {
      get: (id: number | undefined) => {
        if (id === 200) return attachmentItem;
        if (id === 100) return parentItem;
        return null;
      },
    },
    BetterBibTeX: {
      KeyManager: {
        get: (id: number) => (id === 100 ? { citationKey: "smith2024" } : null),
      },
    },
    URI: {
      getItemURI: (item) => `http://zotero.org/users/999/items/${item.key}`,
    },
    EditorInstanceUtilities: {
      serializeAnnotations(annotations: PatchAnnotationInput[]): SerializedAnnotationsResult {
        const storedCitationItems: CitationItemLike[] = [];
        let html = "";
        for (const ann of annotations) {
          const att = zotero.Items.get(ann.attachmentItemID);
          if (!att) continue;
          const parent = zotero.Items.get(att.parentID);
          if (parent) {
            const uris = [`http://zotero.org/users/999/items/${parent.key}`];
            if (!storedCitationItems.some((i) => i.uris.some((u) => uris.includes(u)))) {
              storedCitationItems.push({ uris });
            }
          }
          const tmpl = String(zotero.Prefs.get("annotations.noteTemplates.highlight") ?? "").replace(
            /(<blockquote>[^<>]*?)({{highlight}})([\s\S]*?<\/blockquote>)/g,
            (_, p1: string, _p2: string, p3: string) => `${p1}{{highlight quotes='false'}}${p3}`
          );
          const text = ann.text ?? "";
          const vars: Record<string, TemplateVarValue> = {
            color: ann.color || "",
            highlight: (attrs) =>
              attrs.quotes === "false"
                ? `<span class="highlight">${text}</span>`
                : `<span class="highlight">“${text}”</span>`,
            comment: ann.comment || "",
            citation: `<span class="citation">(Smith, 2024, p. ${ann.pageLabel || "1"})</span>`,
            image: "",
            tags: (attrs) => (ann.tags?.map((t) => t.name) ?? []).join(attrs.join || " "),
          };
          html += zoteroGenerateHTMLFromTemplate(tmpl, vars)
            .replace(/([\s]*)(<\/p)/g, "$2")
            .replace(/\s\s+/g, " ");
        }
        return { html, citationItems: storedCitationItems };
      },
    },
  };

  return { zotero, prefs };
}

describe("templateUsesExtendedVars", () => {
  it("returns false for stock Zotero templates", () => {
    expect(templateUsesExtendedVars("<p>{{highlight}} {{citation}} {{comment}}</p>")).toBe(false);
    expect(
      templateUsesExtendedVars(
        "{{if color == '#ff6666'}}<blockquote>{{highlight}}</blockquote>{{endif}}"
      )
    ).toBe(false);
  });

  it("returns true when extended variables are used directly or in conditions", () => {
    expect(
      templateUsesExtendedVars(
        "<p>{{highlight}} [@{{citationKey}}, p. {{pageLabel}}] {{citation}} {{pdfLink}}</p>"
      )
    ).toBe(true);
    expect(
      templateUsesExtendedVars("{{if citationKey}}@{{citationKey}}{{endif}}")
    ).toBe(true);
  });
});

describe("installAnnotationTemplatePatch", () => {
  it("renders user's target template with citationKey, pageLabel, citation, and pdfLink", () => {
    const { zotero } = createMockZotero(
      "<p>{{highlight}} [@{{citationKey}}, p. {{pageLabel}}] {{citation}} {{pdfLink}}</p>"
    );
    const uninstall = installAnnotationTemplatePatch(zotero, {
      generateHTMLFromTemplate: zoteroGenerateHTMLFromTemplate,
    });

    const res = zotero.EditorInstanceUtilities.serializeAnnotations([
      {
        id: "ANNKEY1",
        type: "highlight",
        attachmentItemID: 200,
        text: "Key finding",
        pageLabel: "42",
        position: { pageIndex: 41 },
      },
    ]);

    expect(res.html).toBe(
      '<p><span class="highlight">“Key finding”</span> [@smith2024, p. 42] <span class="citation">(Smith, 2024, p. 42)</span> <a href="zotero://open-pdf/library/items/ATTKEY1?page=42&amp;annotation=ANNKEY1">pdf</a></p>'
    );
    expect(res.citationItems).toHaveLength(1);

    uninstall();
  });

  it("supports Quick Copy annotation shape (key without id)", () => {
    const { zotero } = createMockZotero("<p>{{highlight}} {{pdfLink}}</p>");
    installAnnotationTemplatePatch(zotero, {
      generateHTMLFromTemplate: zoteroGenerateHTMLFromTemplate,
    });

    const res = zotero.EditorInstanceUtilities.serializeAnnotations([
      {
        key: "QUICKKEY1",
        type: "highlight",
        attachmentItemID: 200,
        text: "Quick copy text",
        position: { pageIndex: 2 },
      },
    ]);

    expect(res.html).toContain("zotero://open-pdf/library/items/ATTKEY1?page=3&amp;annotation=QUICKKEY1");
  });

  it("supports conditionals and blockquote unquoted highlight", () => {
    const { zotero } = createMockZotero(
      "<blockquote>{{highlight}}</blockquote><p>{{if citationKey}}[@{{citationKey}}{{if pageLabel}}, p. {{pageLabel}}{{endif}}]{{endif}}</p>"
    );
    installAnnotationTemplatePatch(zotero, {
      generateHTMLFromTemplate: zoteroGenerateHTMLFromTemplate,
    });

    const res = zotero.EditorInstanceUtilities.serializeAnnotations([
      {
        id: "A1",
        type: "highlight",
        attachmentItemID: 200,
        text: "Quoted disabled",
        pageLabel: "iv",
        position: { pageIndex: 3 },
      },
    ]);

    expect(res.html).toBe(
      '<blockquote><span class="highlight">Quoted disabled</span></blockquote><p>[@smith2024, p. iv]</p>'
    );
  });

  it("deduplicates citationItems across multiple annotations and restores original on uninstall", () => {
    const { zotero } = createMockZotero("<p>{{highlight}} [@{{citationKey}}]</p>");
    const orig = zotero.EditorInstanceUtilities.serializeAnnotations;
    const uninstall = installAnnotationTemplatePatch(zotero, {
      generateHTMLFromTemplate: zoteroGenerateHTMLFromTemplate,
    });

    const res = zotero.EditorInstanceUtilities.serializeAnnotations([
      { id: "A1", type: "highlight", attachmentItemID: 200, text: "One", position: { pageIndex: 0 } },
      { id: "A2", type: "highlight", attachmentItemID: 200, text: "Two", position: { pageIndex: 1 } },
    ]);

    expect(res.citationItems).toHaveLength(1);
    expect(res.html).toContain("One");
    expect(res.html).toContain("Two");

    uninstall();
    expect(zotero.EditorInstanceUtilities.serializeAnnotations).toBe(orig);
  });
});
