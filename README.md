# Visual Regression Testing — BackstopJS

Compares screenshots across environments to catch unintended visual changes.

---

## Dashboard

A local web dashboard lets you manage pages, run comparisons, and view results — all from a browser.

```bash
npm start
# → BackstopJS Dashboard → http://localhost:3060
```

Open `http://localhost:3060` after starting.

---

## Environments

| Name | Alias | URL |
|------|-------|-----|
| `local` | — | https://authorities.lndo.site |
| `dev` | — | https://dev-esirestructure.pantheonsite.io |
| `test` | `staging` | https://test-esirestructure.pantheonsite.io |
| `liveV2` | — | https://live-esirestructure.pantheonsite.io |
| `ESIprod` | `prod` | https://esicorporatewebsite.prod.acquia-sites.com |

Default comparison pairs shown on the dashboard:

| Pair | Reference | Compare |
|------|-----------|---------|
| local-vs-dev | local | dev |
| dev-vs-test | dev | test |
| test-vs-liveV2 | test | liveV2 |
| liveV2-vs-ESIprod | liveV2 | ESIprod |

---

## Dashboard Features

### Comparison Cards

A card is shown for each environment pair displaying pass/fail counts and last run time.

- **View Report** — opens a clean in-dashboard report panel (see below)
- **▶ Run** — captures fresh reference screenshots and compares them; output streams live to the console

### Viewport Selector

Above the cards, toggle which viewports are included in the next run:

```
Viewports:  [Desktop ✓]  [Tablet ✓]  [Mobile ✓]
```

Deselect any combination (at least one must stay active). The selection is applied to both full runs and Quick Tests.

### Tag Filter

When pages have tags, a filter bar appears above the cards:

```
Run filter:  [All pages]  [about]  [market]  [sustainability]  …
```

Selecting a tag limits the next **▶ Run** to only pages with that tag. BackstopJS's `--filter` flag is used under the hood.

### Quick Test

Run a one-time comparison for any single URL path without adding it to `scenarios.js`:

1. Enter a path (e.g. `/contact-us`)
2. Optionally add a label
3. Pick **Reference** and **Compare** environments from the dropdowns
4. Select which viewports to test
5. Click **▶ Run Test** — output streams live; a **View Report →** link appears when done

Quick test reports are stored under `backstop_data/quick-runs/` and are not archived.

### Clean Report Panel

After a run completes, click **View Report** on a card to open the in-dashboard report panel:

- **Header** shows the environment pair and tag filter used (e.g. `liveV2 → ESIprod · tag: market`)
- **Run timestamp** is shown next to the header
- **Per-page table** — one row per scenario, columns for Desktop / Tablet / Mobile:
  - ✓ — passed
  - X.XX% — failed, showing the mismatch percentage
  - — — viewport was not included in this run
- **Full Report ↗** — opens the full BackstopJS HTML diff report in a new tab
- **⬇ PDF** — opens the browser print dialog; only the report table is printed (all other UI is hidden)
- **× Close** — dismisses the panel

### Run History

A collapsible **Run History** section below the pages table lists every archived run across all pairs:

- Columns: **Environments**, **Date & Time**, **Tag**, **Viewports**, **Result**
- Click **View** on any row to open that run's report in the report panel
- Runs are archived automatically each time a comparison completes
- History is stored locally in `backstop_data/<pair>/archive/` and is not committed to git

### Pages Being Tested

A collapsible table listing every page in the test suite. Click the header to expand.

- **+ Add Page** — inline form to add a new page (label, path, optional tags)
- **Tags cell** — click to add or edit tags inline
- **×** — removes the page from `scenarios.js` (with confirmation)

### Restart Server

The **⟳ Restart Server** button in the header restarts the Node process in place and refreshes the dashboard automatically when it comes back online.

---

## Running Tests (CLI)

Use the helper script directly with any environment pair:

```bash
./compare.sh <ref_env> <test_env> [extra backstop flags]

# Examples
./compare.sh liveV2 ESIprod
./compare.sh dev test
./compare.sh test liveV2 --filter="About"
```

### What happens when you run a comparison

1. **Reference** — screenshots are captured from `<ref_env>` and saved as the baseline
2. **Test** — screenshots are captured from `<test_env>` and compared against the baseline
3. **Report** — an HTML report is generated at `backstop_data/<ref>-vs-<test>/html_report/index.html`

> "Mismatch errors found" at the end is normal — it just means differences were detected. Open the report to review them.

---

## Approving Changes

If diffs are expected (e.g. intentional design changes), approve them to promote the test screenshots as the new baseline:

```bash
npx backstop approve --config=backstop.config.js --ref=liveV2 --test=ESIprod
```

Adjust `--ref` and `--test` to match the pair you want to approve.

---

## Managing Pages

### Via the Dashboard

Use the **Pages Being Tested** section to add, tag, and remove pages without touching any files.

### Via scenarios.js

All pages are defined in [scenarios.js](scenarios.js). Add a new entry to the array:

```js
{ "label": "Page Label", "path": "/your-page-path", "tags": ["esiv2"] }
```

The `path` is appended to each environment's base URL automatically.

### Tags

Pages can be tagged to allow running subsets of the test suite:

```js
{ "label": "About", "path": "/about", "tags": ["esiv2", "about"] }
```

Current tags in use: `esiv2` (all pages), `about`, `business`, `market`, `news`, `sustainability`, `other`

Tags can be added and edited from the dashboard without editing the file directly.

### Per-page options

| Option | Type | Description |
|--------|------|-------------|
| `tags` | string[] | Tag this page for filtered runs |
| `delay` | number (ms) | Extra wait after page load (default: 1500ms) |
| `selectors` | string[] | Only screenshot these CSS selectors instead of the full page |
| `hideSelectors` | string[] | Hide elements (set `visibility: hidden`) before screenshotting |
| `removeSelectors` | string[] | Remove elements from the DOM before screenshotting |
| `readySelector` | string | Wait for this CSS selector to appear before screenshotting |

**Example with overrides:**

```js
{
  "label": "Homepage",
  "path": "/",
  "tags": ["esiv2"],
  "delay": 3000,
  "hideSelectors": [".live-chat-widget"],
  "removeSelectors": ["#some-ad-banner"]
}
```

---

## Viewports

Screenshots are taken at three widths for every scenario:

| Label | Width | Height |
|-------|-------|--------|
| desktop | 1920px | 1080px |
| tablet | 1024px | 768px |
| mobile | 375px | 812px |

Use the viewport toggles in the dashboard or the `--viewports` CLI flag to limit a run to specific widths:

```bash
./compare.sh liveV2 ESIprod --viewports=desktop
./compare.sh liveV2 ESIprod --viewports=desktop,tablet
```

---

## How It Works

### Cookie / banner suppression
`onBefore.js` sets cookies before each page loads to automatically dismiss cookie consent banners.

### Continue gate dismissal
`onReady.js` checks for a `button.pds-button` gate element (present on dev, test, and liveV2) and clicks it before screenshotting. If the button is not present (ESIprod, local) this step is skipped.

### Animation freezing & lazy image loading
`onReady.js` also:
1. Freezes all CSS animations and transitions to prevent false diffs from motion
2. Scrolls the full page to trigger any lazy-loaded images
3. Waits for all images to finish loading before the screenshot is taken

### Elements removed globally
These selectors are removed from every screenshot (configured in `backstop.config.js`):
- `#onetrust-consent-sdk`, `#onetrust-banner-sdk`, `.cookie-banner`
- Any element with `cookie` in its id or class
- Ad iframes (DoubleClick, Google Syndication, Ad Service)

---

## Project Structure

```
backstopjs/
├── scenarios.js                          # Page definitions — source of truth
├── backstop.config.js                    # BackstopJS configuration
├── server.js                             # Dashboard web server
├── dashboard.html                        # Dashboard UI
├── compare.sh                            # CLI wrapper for reference + test
├── package.json
└── backstop_data/
    ├── engine_scripts/
    │   └── puppet/
    │       ├── onBefore.js               # Sets cookies before page load
    │       └── onReady.js                # Dismisses gate, freezes animations, loads lazy images
    ├── quick-runs/                        # One-time Quick Test results (not archived)
    │   └── quick-<timestamp>/
    │       └── html_report/
    └── <ref>-vs-<test>/                  # Saved comparison pair results
        ├── archive/                      # Auto-archived run summaries (gitignored)
        │   └── <YYYYMMDD-HHMMSS>.json
        ├── bitmaps_reference/            # Baseline screenshots
        ├── bitmaps_test/                 # Latest test screenshots (gitignored)
        └── html_report/                  # Visual diff report (gitignored)
```
