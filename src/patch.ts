/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import {
  buildExtendedVars,
  templateUsesExtendedVars,
  type AnnotationLike,
  type ExtendedItemLike,
  type ExtendedZoteroLike,
  type TemplateVarValue,
} from "./variables";

export type TemplateRenderer = (
  template: string,
  vars: Record<string, TemplateVarValue>
) => string;

export interface CitationItemLike {
  uris: string[];
  [key: string]: unknown;
}

export interface SerializedAnnotationsResult {
  html: string;
  citationItems: CitationItemLike[];
}

export interface PatchAnnotationInput extends AnnotationLike {
  attachmentItemID?: number;
  tags?: Array<{ name: string }>;
}

export interface PatchItemLike extends ExtendedItemLike {
  parentID?: number;
}

export interface PatchZoteroLike extends ExtendedZoteroLike {
  Prefs: {
    get(pref: string, ...args: unknown[]): unknown;
  };
  Items: {
    get(id: number | undefined): PatchItemLike | null | undefined;
  };
  EditorInstanceUtilities: {
    serializeAnnotations(
      annotations: PatchAnnotationInput[],
      skipEmbeddingItemData?: boolean
    ): SerializedAnnotationsResult;
  };
  Utilities?: {
    Internal?: {
      generateHTMLFromTemplate?: TemplateRenderer;
    };
  };
  logError?(err: unknown): void;
  debug?(msg: string): void;
}

export interface ChromeUtilsLike {
  importESModule?(url: string): {
    generateHTMLFromTemplate?: TemplateRenderer;
  };
}

export interface InstallPatchOptions {
  chromeUtils?: ChromeUtilsLike | null;
  generateHTMLFromTemplate?: TemplateRenderer;
}

/**
 * Resolve Zotero's built-in `generateHTMLFromTemplate` function across Zotero 7–11.
 */
export function resolveTemplateRenderer(
  zotero: PatchZoteroLike,
  chromeUtils?: ChromeUtilsLike | null
): TemplateRenderer {
  if (chromeUtils && typeof chromeUtils.importESModule === "function") {
    try {
      const mod = chromeUtils.importESModule(
        "chrome://zotero/content/modules/templates.mjs"
      );
      if (typeof mod?.generateHTMLFromTemplate === "function") {
        return mod.generateHTMLFromTemplate;
      }
    } catch {
      // Fall back to Zotero 7 internal helper
    }
  }

  const legacy = zotero?.Utilities?.Internal?.generateHTMLFromTemplate;
  if (typeof legacy === "function") {
    return legacy;
  }

  throw new Error(
    "Unable to resolve Zotero's generateHTMLFromTemplate renderer"
  );
}

function extractBetween(text: string, marker: string): string {
  const start = text.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const contentStart = start + marker.length;
  const end = text.indexOf(marker, contentStart);
  if (end === -1) {
    return "";
  }
  return text.slice(contentStart, end);
}

function mergeCitationItems(
  target: CitationItemLike[],
  incoming: CitationItemLike[] | undefined
): void {
  if (!incoming?.length) {
    return;
  }
  for (const item of incoming) {
    const alreadyExists = target.some((existing) =>
      existing.uris?.some((uri) => item.uris?.includes(uri))
    );
    if (!alreadyExists) {
      target.push(item);
    }
  }
}

function getTemplatePrefKey(annotationType: string | undefined): string | null {
  if (annotationType === "highlight" || annotationType === "underline") {
    return "annotations.noteTemplates.highlight";
  }
  if (annotationType === "note" || annotationType === "text") {
    return "annotations.noteTemplates.note";
  }
  return null;
}

/**
 * Patch `Zotero.EditorInstanceUtilities.serializeAnnotations` so extended template
 * variables (`citationKey`, `pageLabel`, `pdfLink`, etc.) are available in
 * `extensions.zotero.annotations.noteTemplates.*`.
 *
 * Returns an idempotent `uninstall()` function that restores the original method.
 */
export function installAnnotationTemplatePatch(
  zotero: PatchZoteroLike,
  options: InstallPatchOptions = {}
): () => void {
  const editorUtils = zotero.EditorInstanceUtilities;
  const origSerialize = editorUtils.serializeAnnotations;
  const renderTemplate =
    options.generateHTMLFromTemplate ??
    resolveTemplateRenderer(zotero, options.chromeUtils);

  let uninstalled = false;

  editorUtils.serializeAnnotations = function patchedSerializeAnnotations(
    this: unknown,
    annotations: PatchAnnotationInput[],
    skipEmbeddingItemData?: boolean
  ): SerializedAnnotationsResult {
    if (!Array.isArray(annotations) || annotations.length === 0) {
      return origSerialize.call(this, annotations, skipEmbeddingItemData);
    }

    const storedCitationItems: CitationItemLike[] = [];
    let html = "";

    for (const annotation of annotations) {
      const prefKey = getTemplatePrefKey(annotation?.type);
      if (!prefKey) {
        const res = origSerialize.call(this, [annotation], skipEmbeddingItemData);
        html += res.html;
        mergeCitationItems(storedCitationItems, res.citationItems);
        continue;
      }

      const userTemplate = zotero.Prefs.get(prefKey);
      if (
        typeof userTemplate !== "string" ||
        !templateUsesExtendedVars(userTemplate)
      ) {
        const res = origSerialize.call(this, [annotation], skipEmbeddingItemData);
        html += res.html;
        mergeCitationItems(storedCitationItems, res.citationItems);
        continue;
      }

      const nonce = `__ZNT_${Math.random().toString(36).slice(2)}_${Date.now()}__`;
      const sentinelTemplate = [
        `${nonce}HQ${nonce}{{highlight}}${nonce}HQ${nonce}`,
        `${nonce}HU${nonce}{{highlight quotes='false'}}${nonce}HU${nonce}`,
        `${nonce}CT${nonce}{{citation}}${nonce}CT${nonce}`,
        `${nonce}CM${nonce}{{comment}}${nonce}CM${nonce}`,
        `${nonce}IM${nonce}{{image}}${nonce}IM${nonce}`,
        `${nonce}CL${nonce}{{color}}${nonce}CL${nonce}`,
      ].join("");

      const origPrefsGet = zotero.Prefs.get;
      let nativeResult: SerializedAnnotationsResult;

      try {
        zotero.Prefs.get = function patchedPrefsGet(
          pref: string,
          ...args: unknown[]
        ): unknown {
          if (pref === prefKey || pref === `extensions.zotero.${prefKey}`) {
            return sentinelTemplate;
          }
          return origPrefsGet.call(zotero.Prefs, pref, ...args);
        };

        nativeResult = origSerialize.call(
          this,
          [annotation],
          skipEmbeddingItemData
        );
      } finally {
        zotero.Prefs.get = origPrefsGet;
      }

      mergeCitationItems(storedCitationItems, nativeResult.citationItems);

      if (!nativeResult.html) {
        continue;
      }

      try {
        const nativeHighlightQuoted = extractBetween(
          nativeResult.html,
          `${nonce}HQ${nonce}`
        );
        const nativeHighlightUnquoted = extractBetween(
          nativeResult.html,
          `${nonce}HU${nonce}`
        );
        const nativeCitation = extractBetween(
          nativeResult.html,
          `${nonce}CT${nonce}`
        );
        const nativeComment = extractBetween(
          nativeResult.html,
          `${nonce}CM${nonce}`
        );
        const nativeImage = extractBetween(
          nativeResult.html,
          `${nonce}IM${nonce}`
        );
        const nativeColor = extractBetween(
          nativeResult.html,
          `${nonce}CL${nonce}`
        );

        const processedTemplate = userTemplate.replace(
          /(<blockquote>[^<>]*?)({{highlight}})([\s\S]*?<\/blockquote>)/g,
          (_match, p1: string, _p2: string, p3: string) =>
            `${p1}{{highlight quotes='false'}}${p3}`
        );

        const attachmentItem =
          typeof annotation.attachmentItemID === "number"
            ? zotero.Items.get(annotation.attachmentItemID)
            : null;
        const parentItem =
          attachmentItem && typeof attachmentItem.parentID === "number"
            ? zotero.Items.get(attachmentItem.parentID)
            : null;

        const extendedVars = buildExtendedVars({
          annotation,
          attachmentItem,
          parentItem,
          zotero,
        });

        const vars: Record<string, TemplateVarValue> = {
          ...extendedVars,
          color: nativeColor,
          highlight: (attrs: Record<string, string> = {}) =>
            attrs.quotes === "false"
              ? nativeHighlightUnquoted
              : nativeHighlightQuoted,
          comment: nativeComment,
          citation: nativeCitation,
          image: nativeImage,
          tags: (attrs: Record<string, string> = {}) =>
            (annotation.tags?.map((tag) => tag.name) ?? []).join(
              attrs.join || " "
            ),
        };

        let templateHTML = renderTemplate(processedTemplate, vars);
        templateHTML = templateHTML.replace(/([\s]*)(<\/p)/g, "$2");
        templateHTML = templateHTML.replace(/\s\s+/g, " ");
        html += templateHTML;
      } catch (err) {
        zotero.logError?.(err);
        const fallbackRes = origSerialize.call(
          this,
          [annotation],
          skipEmbeddingItemData
        );
        html += fallbackRes.html;
        mergeCitationItems(storedCitationItems, fallbackRes.citationItems);
      }
    }

    return { html, citationItems: storedCitationItems };
  };

  return function uninstall(): void {
    if (uninstalled) {
      return;
    }
    uninstalled = true;
    editorUtils.serializeAnnotations = origSerialize;
  };
}
