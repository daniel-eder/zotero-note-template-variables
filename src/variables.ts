/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import { resolveCitationKey, safeGetField, type CitationKeyItemLike, type CitationKeyZoteroLike } from "./citationKey";
import {
  buildItemURI,
  buildPdfLinkInfo,
  escapeHTML,
  formatItemLink,
  formatPdfLink,
  type AnnotationPositionLike,
  type LinkItemLike,
  type LinkZoteroLike,
} from "./links";

export const BUILTIN_TEMPLATE_VARS = new Set([
  "color",
  "highlight",
  "comment",
  "citation",
  "image",
  "tags",
]);

export const TEMPLATE_KEYWORDS = new Set(["if", "elseif", "else", "endif"]);

export type TemplateVarValue = string | ((attrs: Record<string, string>) => string);

export interface CreatorLike {
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface ExtendedItemLike extends CitationKeyItemLike, LinkItemLike {
  getCreators?(): CreatorLike[];
}

export interface AnnotationLike {
  id?: string;
  key?: string;
  type?: string;
  text?: string;
  comment?: string;
  pageLabel?: string;
  color?: string;
  dateModified?: string;
  position?: AnnotationPositionLike | null;
}

export type ExtendedZoteroLike = CitationKeyZoteroLike & LinkZoteroLike;

function hyphenToCamel(name: string): string {
  return name.replace(/-(.)/g, (_, g1: string) => g1.toUpperCase());
}

/**
 * Extract top-level `{{ ... }}` statements from a template, respecting quoted string literals.
 */
function extractTemplateStatements(template: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let start = -1;
  let i = 0;

  while (i < template.length) {
    if (depth > 0 && (template[i] === '"' || template[i] === "'")) {
      const quote = template[i];
      i++;
      while (i < template.length && template[i] !== quote) {
        i++;
      }
      if (i < template.length) {
        i++;
      }
    } else if (template.slice(i, i + 2) === "{{") {
      if (depth === 0) {
        start = i + 2;
      }
      depth++;
      i += 2;
    } else if (template.slice(i, i + 2) === "}}") {
      depth--;
      if (depth === 0 && start !== -1) {
        statements.push(template.slice(start, i));
        start = -1;
      } else if (depth < 0) {
        depth = 0;
      }
      i += 2;
    } else {
      i++;
    }
  }

  return statements;
}

function stripQuotedLiterals(expr: string): string {
  return expr.replace(/"[^"]*"|'[^']*'/g, " ");
}

function conditionUsesExtendedVars(condition: string): boolean {
  // Handle nested {{ ... }} statements inside conditions first
  const withoutNested = condition.replace(/\{\{([\s\S]*?)\}\}/g, (_, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
      const op = hyphenToCamel(trimmed.split(/\s+/, 1)[0]);
      if (op && !BUILTIN_TEMPLATE_VARS.has(op) && !TEMPLATE_KEYWORDS.has(op)) {
        return ` __EXTENDED__ `;
      }
    }
    return " ";
  });

  if (withoutNested.includes("__EXTENDED__")) {
    return true;
  }

  const cleaned = stripQuotedLiterals(withoutNested)
    .replace(/==|!=|>=|<=|>|<|&&|\|\||!|\(|\)/g, " ");

  for (const token of cleaned.split(/\s+/)) {
    if (!token || /^\d+(?:\.\d+)?$/.test(token)) {
      continue;
    }
    const ident = hyphenToCamel(token);
    if (!BUILTIN_TEMPLATE_VARS.has(ident) && !TEMPLATE_KEYWORDS.has(ident)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true if the template references any variable outside Zotero's built-in set
 * (`color`, `highlight`, `comment`, `citation`, `image`, `tags`).
 */
export function templateUsesExtendedVars(template: string): boolean {
  if (!template || !template.includes("{{")) {
    return false;
  }

  for (const rawStatement of extractTemplateStatements(template)) {
    const statement = rawStatement.trim();
    if (!statement || statement.startsWith('"') || statement.startsWith("'")) {
      continue;
    }

    const operator = statement.split(/\s+/, 1)[0];
    if (operator === "else" || operator === "endif") {
      continue;
    }

    if (operator === "if" || operator === "elseif") {
      const rest = statement.slice(operator.length).trim();
      if (conditionUsesExtendedVars(rest)) {
        return true;
      }
      continue;
    }

    const ident = hyphenToCamel(operator);
    if (!BUILTIN_TEMPLATE_VARS.has(ident)) {
      return true;
    }
  }

  return false;
}

function formatCreatorName(creator: CreatorLike): string {
  if (creator.lastName && creator.firstName) {
    return `${creator.lastName}, ${creator.firstName}`;
  }
  return creator.lastName || creator.name || creator.firstName || "";
}

function extractYear(dateStr: string): string {
  if (!dateStr) {
    return "";
  }
  const match = dateStr.match(/\b(\d{4})\b/);
  return match?.[1] ?? "";
}

/**
 * Build the extended template variables map for an annotation and its parent item.
 * All values and function return values are guaranteed to be strings.
 */
export function buildExtendedVars(params: {
  annotation: AnnotationLike;
  attachmentItem?: ExtendedItemLike | null;
  parentItem?: ExtendedItemLike | null;
  zotero?: ExtendedZoteroLike | null;
}): Record<string, TemplateVarValue> {
  const { annotation, attachmentItem, parentItem, zotero } = params;
  const annotationKey = String(annotation.id || annotation.key || "");

  const citationKey = resolveCitationKey(parentItem, zotero);
  const pageLabel = annotation.pageLabel ? String(annotation.pageLabel) : "";
  const pageIndex =
    typeof annotation.position?.pageIndex === "number"
      ? String(annotation.position.pageIndex + 1)
      : "";

  const pdfLinkInfo = buildPdfLinkInfo({
    position: annotation.position,
    annotationKey,
    attachmentItem,
    zotero,
  });

  const itemURI = buildItemURI({
    parentItem,
    zotero,
  });

  const title = safeGetField(parentItem, "title");
  const shortTitle = safeGetField(parentItem, "shortTitle") || title;
  const date = safeGetField(parentItem, "date");
  const year = extractYear(date);
  const doi = safeGetField(parentItem, "DOI");
  const url = safeGetField(parentItem, "url");
  const publicationTitle = safeGetField(parentItem, "publicationTitle");

  let creatorNames: string[] = [];
  if (parentItem && typeof parentItem.getCreators === "function") {
    try {
      creatorNames = parentItem
        .getCreators()
        .map(formatCreatorName)
        .filter((name) => name.length > 0);
    } catch {
      creatorNames = [];
    }
  }

  const firstAuthor = creatorNames[0] ?? "";
  const highlightText = escapeHTML(String(annotation.text || "").trim());
  const commentText = escapeHTML(String(annotation.comment || "").trim());
  const annotationType = String(annotation.type || "");
  const dateModified = String(annotation.dateModified || "");

  return {
    citationKey,
    citekey: citationKey,
    pageLabel: (attrs = {}) => {
      if (pageLabel) {
        return pageLabel;
      }
      return attrs.fallback === "index" ? pageIndex : "";
    },
    page: (attrs = {}) => {
      if (pageLabel) {
        return pageLabel;
      }
      return attrs.fallback === "index" ? pageIndex : "";
    },
    pageIndex,
    pdfLink: (attrs = {}) => formatPdfLink(pdfLinkInfo, attrs),
    pdfURI: pdfLinkInfo.uri,
    pdfUrl: pdfLinkInfo.uri,
    itemLink: (attrs = {}) => formatItemLink(itemURI, attrs),
    itemURI,
    itemUrl: itemURI,
    annotationKey,
    attachmentKey: String(attachmentItem?.key || ""),
    itemKey: String(parentItem?.key || ""),
    title,
    shortTitle,
    date,
    year,
    author: firstAuthor,
    authors: (attrs = {}) => creatorNames.join(attrs.join || ", "),
    doi,
    url,
    publicationTitle,
    annotationType,
    type: annotationType,
    dateModified,
    highlightText,
    commentText,
    field: (attrs = {}) => safeGetField(parentItem, attrs.name || attrs.field || ""),
  };
}
