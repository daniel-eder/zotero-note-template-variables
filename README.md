# Note Template Variables for Zotero

A Zotero 7–11 plugin that extends Zotero's built-in annotation note templating (`extensions.zotero.annotations.noteTemplates.highlight` and `extensions.zotero.annotations.noteTemplates.note`) with item metadata, Better BibTeX / native citation keys, page labels, and direct `zotero://open-pdf/...` links.

Works everywhere Zotero serializes annotations:
- **Add Note from Annotations**
- **Drag-and-drop annotations into notes**
- **Quick Copy / Markdown export**

## Example Configuration

In Zotero, open **Settings → Advanced → Config Editor** and set `extensions.zotero.annotations.noteTemplates.highlight` to:

```html
<p>{{highlight}} {{citation}} {{comment}} [@{{citationKey}}, p. {{pageLabel}}]</p>
```

Or with conditionals for missing citation keys / page labels:

```html
<p>{{highlight}} {{citation}} {{comment}}{{if citationKey}} [@{{citationKey}}{{if pageLabel}}, p. {{pageLabel}}{{endif}}]{{endif}}</p>
```

> **Tip (Quick Copy / Markdown):** If you include `{{pdfLink}}` in your template and use Zotero's Quick Copy with **Include Zotero Links** enabled, Zotero's Note Markdown / Note HTML translators will also append their own `(pdf)` link. Disable **Include Zotero Links** in **Settings → Export → Note Format** if you only want `{{pdfLink}}`.

## Available Template Variables

All built-in Zotero variables (`{{highlight}}`, `{{comment}}`, `{{citation}}`, `{{image}}`, `{{color}}`, `{{tags}}`) continue to work identically, including `{{highlight quotes='false'}}` and `<blockquote>{{highlight}}</blockquote>`.

| Variable | Description | Example / Attributes |
| --- | --- | --- |
| `{{citationKey}}` (alias `{{citekey}}`) | Parent item's citation key (native `citationKey`, Better BibTeX `KeyManager`, or `Extra` field) | `smith2024` |
| `{{pageLabel}}` (alias `{{page}}`) | Annotation page label | `{{pageLabel fallback="index"}}` falls back to 1-based `pageIndex` if empty |
| `{{pageIndex}}` | 1-based physical PDF page number | `42` |
| `{{pdfLink}}` | `<a href="zotero://open-pdf/...">pdf</a>` link to the annotation | `{{pdfLink text="open"}}`, `{{pdfLink raw="true"}}` |
| `{{pdfURI}}` (alias `{{pdfUrl}}`) | Raw `zotero://open-pdf/...` URI | `zotero://open-pdf/library/items/...` |
| `{{itemLink}}` | `<a href="zotero://select/...">zotero</a>` link to the parent item | `{{itemLink text="item"}}`, `{{itemLink raw="true"}}` |
| `{{itemURI}}` (alias `{{itemUrl}}`) | Raw `zotero://select/...` URI | `zotero://select/library/items/...` |
| `{{annotationKey}}` | Annotation item key | `ANNKEY1` |
| `{{attachmentKey}}` | Attachment item key | `ATTKEY1` |
| `{{itemKey}}` | Parent item key | `PARENT1` |
| `{{title}}`, `{{shortTitle}}` | Parent item title / short title | |
| `{{date}}`, `{{year}}` | Parent item date / 4-digit year | |
| `{{author}}`, `{{authors}}` | First author / joined authors | `{{authors join="; "}}` |
| `{{doi}}`, `{{url}}`, `{{publicationTitle}}` | Parent item DOI, URL, or publication title | |
| `{{annotationType}}` (alias `{{type}}`) | Annotation type (`highlight`, `underline`, `note`, etc.) | |
| `{{dateModified}}` | Annotation modification timestamp | |
| `{{highlightText}}`, `{{commentText}}` | HTML-escaped plain highlight / comment text | |
| `{{field}}` | Arbitrary parent item field | `{{field name="volume"}}` |

## Installation

1. Download the latest `note-template-variables.xpi` from the [GitHub Releases](https://github.com/daniel-eder/zotero-note-template-variables/releases/latest) page (or build it from source with `npm run build`, which outputs `.scaffold/build/note-template-variables.xpi`).
2. In Zotero, open **Tools → Plugins**, click the gear icon, and choose **Install Plugin From File…**.
3. Select the `.xpi` file. Zotero will automatically check for updates via the hosted `update.json` manifest.

## Development

```powershell
npm install
npm run typecheck
npm test
npm run build
```

For live development with Zotero, copy `.env.example` to `.env`, set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`, and run:

```powershell
npm start
```

## License

Copyright (c) 2026 Daniel Eder. Licensed under the [MIT License](LICENSE).
