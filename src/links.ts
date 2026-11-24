/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

export interface AnnotationPositionLike {
  type?: string;
  value?: string;
  pageIndex?: number;
}

export interface LinkItemLike {
  key?: string;
  libraryID?: number;
  library?: {
    libraryType?: string;
    groupID?: number;
  };
}

export interface LinkZoteroLike {
  URI?: {
    getItemURI?(item: LinkItemLike): string;
  };
  Libraries?: {
    get?(libraryID: number): { libraryType?: string; groupID?: number } | null | undefined;
  };
}

export interface PdfLinkInfo {
  uri: string;
  defaultText: string;
}

/**
 * Escape text for safe inclusion in HTML content.
 */
export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escape text for safe inclusion inside a double-quoted HTML attribute.
 */
export function escapeHTMLAttr(str: string): string {
  return escapeHTML(str).replace(/"/g, "&quot;");
}

function parseZoteroItemURI(uri: string): { libraryPath: string; key: string } | null {
  if (!uri) {
    return null;
  }
  const parts = uri.split("/");
  const key = parts[parts.length - 1];
  if (!key) {
    return null;
  }
  // e.g. http://zotero.org/users/12345/items/ABCD1234
  if (parts[3] === "users") {
    return { libraryPath: "library", key };
  }
  // e.g. http://zotero.org/groups/12345/items/ABCD1234
  if (parts[3] === "groups" && parts[4]) {
    return { libraryPath: `groups/${parts[4]}`, key };
  }
  return null;
}

function resolveLibraryPathAndKey(
  uri: string | undefined,
  item: LinkItemLike | null | undefined,
  zotero?: LinkZoteroLike | null
): { libraryPath: string; key: string } | null {
  if (uri) {
    const parsed = parseZoteroItemURI(uri);
    if (parsed) {
      return parsed;
    }
  }

  if (item) {
    try {
      const generatedURI = zotero?.URI?.getItemURI?.(item);
      if (generatedURI) {
        const parsed = parseZoteroItemURI(generatedURI);
        if (parsed) {
          return parsed;
        }
      }
    } catch {
      // Fall back to item key + library metadata
    }

    if (item.key) {
      const lib =
        item.library ??
        (typeof item.libraryID === "number" ? zotero?.Libraries?.get?.(item.libraryID) : undefined);
      if (lib?.libraryType === "group" && typeof lib.groupID === "number") {
        return { libraryPath: `groups/${lib.groupID}`, key: item.key };
      }
      return { libraryPath: "library", key: item.key };
    }
  }

  return null;
}

/**
 * Build a `zotero://open-pdf/...` URI and default link label for an annotation,
 * matching Zotero's Note HTML / Note Markdown translator conventions.
 */
export function buildPdfLinkInfo(params: {
  attachmentURI?: string;
  position?: AnnotationPositionLike | null;
  annotationKey?: string;
  attachmentItem?: LinkItemLike | null;
  zotero?: LinkZoteroLike | null;
}): PdfLinkInfo {
  const resolved = resolveLibraryPathAndKey(
    params.attachmentURI,
    params.attachmentItem,
    params.zotero
  );
  if (!resolved) {
    return { uri: "", defaultText: "pdf" };
  }

  let openURI = `zotero://open-pdf/${resolved.libraryPath}/items/${resolved.key}`;
  let defaultText = "pdf";
  const pos = params.position;

  if (pos?.type === "FragmentSelector") {
    openURI += `?cfi=${encodeURIComponent(pos.value ?? "")}`;
    defaultText = "epub";
  } else if (pos?.type === "CssSelector") {
    openURI += `?sel=${encodeURIComponent(pos.value ?? "")}`;
    defaultText = "snapshot";
  } else {
    const page = typeof pos?.pageIndex === "number" ? pos.pageIndex + 1 : 1;
    openURI += `?page=${page}`;
    defaultText = "pdf";
  }

  if (params.annotationKey) {
    openURI += `&annotation=${encodeURIComponent(params.annotationKey)}`;
  }

  return { uri: openURI, defaultText };
}

/**
 * Format a PDF link info object into either a raw URI or an HTML `<a>` tag.
 */
export function formatPdfLink(
  info: PdfLinkInfo,
  attrs: Record<string, string> = {}
): string {
  if (!info.uri) {
    return "";
  }
  if (attrs.raw === "true" || attrs.urlOnly === "true") {
    return info.uri;
  }
  const label = attrs.text || attrs.label || info.defaultText;
  return `<a href="${escapeHTMLAttr(info.uri)}">${escapeHTML(label)}</a>`;
}

/**
 * Build a `zotero://select/...` URI for a Zotero item.
 */
export function buildItemURI(params: {
  parentURI?: string;
  parentItem?: LinkItemLike | null;
  zotero?: LinkZoteroLike | null;
}): string {
  const resolved = resolveLibraryPathAndKey(
    params.parentURI,
    params.parentItem,
    params.zotero
  );
  if (!resolved) {
    return "";
  }
  return `zotero://select/${resolved.libraryPath}/items/${resolved.key}`;
}

/**
 * Format an item URI into either a raw URI or an HTML `<a>` tag.
 */
export function formatItemLink(
  uri: string,
  attrs: Record<string, string> = {}
): string {
  if (!uri) {
    return "";
  }
  if (attrs.raw === "true" || attrs.urlOnly === "true") {
    return uri;
  }
  const label = attrs.text || attrs.label || "zotero";
  return `<a href="${escapeHTMLAttr(uri)}">${escapeHTML(label)}</a>`;
}
