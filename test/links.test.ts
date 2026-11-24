/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import { describe, expect, it } from "vitest";
import {
  buildItemURI,
  buildPdfLinkInfo,
  formatItemLink,
  formatPdfLink,
} from "../src/links";

describe("buildPdfLinkInfo & formatPdfLink", () => {
  it("builds user library PDF link with pageIndex + annotation key", () => {
    const info = buildPdfLinkInfo({
      attachmentURI: "http://zotero.org/users/123/items/ATTKEY1",
      position: { pageIndex: 41 },
      annotationKey: "ANNKEY1",
    });
    expect(info).toEqual({
      uri: "zotero://open-pdf/library/items/ATTKEY1?page=42&annotation=ANNKEY1",
      defaultText: "pdf",
    });
    expect(formatPdfLink(info)).toBe(
      '<a href="zotero://open-pdf/library/items/ATTKEY1?page=42&amp;annotation=ANNKEY1">pdf</a>'
    );
  });

  it("builds group library link from attachmentItem when attachmentURI is omitted", () => {
    const info = buildPdfLinkInfo({
      attachmentItem: {
        key: "GRPATT1",
        library: { libraryType: "group", groupID: 9876 },
      },
      position: { pageIndex: 0 },
      annotationKey: "ANN2",
    });
    expect(info.uri).toBe(
      "zotero://open-pdf/groups/9876/items/GRPATT1?page=1&annotation=ANN2"
    );
  });

  it("supports EPUB FragmentSelector and Snapshot CssSelector", () => {
    const epub = buildPdfLinkInfo({
      attachmentURI: "http://zotero.org/users/1/items/EPUB1",
      position: { type: "FragmentSelector", value: "/6/4[chap1]!/4/2" },
    });
    expect(epub).toEqual({
      uri: "zotero://open-pdf/library/items/EPUB1?cfi=%2F6%2F4%5Bchap1%5D!%2F4%2F2",
      defaultText: "epub",
    });

    const snap = buildPdfLinkInfo({
      attachmentURI: "http://zotero.org/users/1/items/SNAP1",
      position: { type: "CssSelector", value: "p.intro" },
    });
    expect(snap).toEqual({
      uri: "zotero://open-pdf/library/items/SNAP1?sel=p.intro",
      defaultText: "snapshot",
    });
  });

  it("supports custom text/label, raw=true, and HTML escaping", () => {
    const info = {
      uri: "zotero://open-pdf/library/items/ATT1?page=5&annotation=ANN1",
      defaultText: "pdf",
    };
    expect(formatPdfLink(info, { text: "Open <PDF>" })).toBe(
      '<a href="zotero://open-pdf/library/items/ATT1?page=5&amp;annotation=ANN1">Open &lt;PDF&gt;</a>'
    );
    expect(formatPdfLink(info, { raw: "true" })).toBe(info.uri);
  });
});

describe("buildItemURI & formatItemLink", () => {
  it("builds zotero://select URI and anchor tag", () => {
    const uri = buildItemURI({
      parentItem: { key: "PARENT1", library: { libraryType: "user" } },
    });
    expect(uri).toBe("zotero://select/library/items/PARENT1");
    expect(formatItemLink(uri, { label: "Item" })).toBe(
      '<a href="zotero://select/library/items/PARENT1">Item</a>'
    );
  });
});
