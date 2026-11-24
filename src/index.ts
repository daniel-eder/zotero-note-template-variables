/*
 * Copyright (c) 2026 Daniel Eder
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import {
  installAnnotationTemplatePatch,
  type ChromeUtilsLike,
  type PatchZoteroLike,
} from "./patch";

declare const Zotero: PatchZoteroLike;
declare const ChromeUtils: ChromeUtilsLike | undefined;

class NoteTemplateVarsPlugin {
  private uninstallPatch: (() => void) | null = null;

  startup(): void {
    if (this.uninstallPatch) {
      return;
    }

    const chromeUtils =
      typeof ChromeUtils !== "undefined" ? ChromeUtils : undefined;

    this.uninstallPatch = installAnnotationTemplatePatch(Zotero, {
      chromeUtils,
    });
    Zotero.debug?.("[NoteTemplateVars] Annotation template variables enabled");
  }

  shutdown(): void {
    if (this.uninstallPatch) {
      this.uninstallPatch();
      this.uninstallPatch = null;
      Zotero.debug?.("[NoteTemplateVars] Annotation template variables disabled");
    }
  }
}

(Zotero as unknown as Record<string, unknown>).NoteTemplateVars =
  new NoteTemplateVarsPlugin();
