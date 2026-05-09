# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Aridata is a **pure client-side web application** for processing SAP Ariba contract data. No server, no build step, no package manager. All processing runs in the browser using CDN-loaded libraries.

It has two functional tabs:
- **Headers** — ingests a contract-header CSV (template format), maps/validates columns, and exports a cleaned Ariba-ready CSV.
- **Items** — ingests one or more line-item CSVs or JSON files, groups rows by `contract_id`, and exports per-contract XLSX workbooks bundled into a ZIP.

## Running the App

Open `index.html` directly in a browser, or serve it with any static file server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

No installation or build is required.

## Running the SAP OData Ping Utility

```bash
pip install requests
python3 PingODataURL.py
```

Edit the `ODATA_SERVICES` list at the top of `PingODataURL.py` to add/remove endpoints. `TIMEOUT`, `USERNAME`, `PASSWORD`, and `VERIFY_SSL` are also configured there.

## Architecture

### Single source of truth: `index.html`

All application logic lives in `index.html` (~2 100 lines). Inline `<style>` handles all CSS. Inline `<script>` at the bottom of the file holds all JavaScript. There is no module system.

### CDN libraries (loaded in `<head>`)

| Library | Version | Purpose |
|---|---|---|
| PapaParse 5.4.1 | `papaparse.min.js` | CSV parsing and serialization |
| SheetJS 0.18.5 | `xlsx.full.min.js` | XLSX workbook generation |
| JSZip 3.10.1 | `jszip.min.js` | ZIP archive assembly |
| Iconify 2.1.0 | `iconify-icon.min.js` | SVG icon rendering |

### Key constants (defined near line 1234)

- `OUTPUT_COLS_HEADERS` — ordered list of columns written to the output contract-header CSV.
- `CONTRACT_ITEM_COLUMNS` — column schema for the per-contract XLSX sheets.
- `HEADER_TEMPLATE_COLUMNS` — expected input columns from the raw header CSV template.
- `ATTR_ORDER` — display order for custom line-item attribute columns mapped into XLSX.
- `TYPE_MAP` / `FIELD_LABELS` — type hints and human labels for attribute fields.

### Data flow: Headers tab

1. User uploads a CSV matching `HEADER_TEMPLATE_COLUMNS`.
2. `processHeaders(file, options)` (line ~1839) maps raw columns → `OUTPUT_COLS_HEADERS`, normalises dates, amounts, and currency codes.
3. `validateHeaderRows(rows)` checks for missing `ContractId`, `Supplier`, and `Amount`.
4. Output is a single `Contracts.csv` blob downloaded via an object URL.

### Data flow: Items tab

1. User uploads one or more CSV/JSON files. JSON is parsed directly; CSV uses PapaParse with `header: true`.
2. `contract_id` field is normalised: non-digits stripped, zero-padded to 10 characters. The alias `contractid` is accepted and renamed.
3. `processLineItems(files, options)` (line ~2166) groups rows by `contract_id`, then calls `buildItemAttributes(rows)` to extract custom attribute columns into a second sheet.
4. Each contract becomes a `LC{contract_id}.xlsx` workbook (two sheets: *Contract Item Information* and *Contract Item Attributes*).
5. All workbooks are zipped via JSZip and downloaded as a single blob.

### UI state

- Button sequence is enforced: Upload → Validate (enabled after upload) → Run (enabled after validate).
- Line-items UI column preferences are persisted to `localStorage` under the key `line_items_settings` (constant `SETTINGS_FILE_ITEMS_KEY`).
- `ui` object (line ~1340) holds references to all DOM nodes used by JS, keyed by area (`headers`, `items`, `summary`).

## Legacy / Unused Files

| File | Status |
|---|---|
| `app.js` | Early prototype — not loaded by `index.html`. Superseded by inline script. |
| `style.css` | Early prototype stylesheet — not loaded by `index.html` (contains a hardcoded local machine path). |
| `assets/index.html` | Older snapshot of the app — not served as the canonical entry point. |

## Security Notes

- `Token.txt` contains a GitHub Personal Access Token. This file should be added to `.gitignore` and the token should be rotated.
- `PingODataURL.py` has hardcoded SAP credentials (`USERNAME`, `PASSWORD`). Move these to environment variables before sharing or extending the script.
