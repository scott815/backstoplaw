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

### Comparison Cards

A card is shown for each environment pair (`local→dev`, `dev→test`, `test→live`) displaying pass/fail counts and last run time.

- **View Report** — opens the full BackstopJS HTML diff report in a new tab
- **▶ Run** — captures fresh reference screenshots and compares them, streaming live output to the console below

### Pages Being Tested

Below the cards, a table lists every page in the test suite with its path and full URLs for each environment.

- **+ add tag / edit** — click on the tags cell of any row to add or change tags inline
- **×** — removes the page from `scenarios.js` (with confirmation)
- **+ Add Page** — opens an inline form to add a new page (label, path, optional tags)

### Tag Filtering

When any page has tags, a filter bar appears above the cards:

```
Run filter:  [All pages]  [canada]  [usa]
```

Selecting a tag changes the **▶ Run** button to **▶ Run [canada]** and limits the comparison to only pages with that tag. BackstopJS's `--filter` flag is used under the hood.

### Quick Test

A one-time comparison panel that doesn't save anything to `scenarios.js`:

- Enter any URL path (e.g. `/contact`)
- Optionally add a label
- Pick the **Reference (from)** and **Compare (to)** environments from dropdowns
- Click **▶ Run Test** — output streams live to the console, and a **View Report →** link appears when done

Quick test reports are stored under `backstop_data/quick-runs/`.

### Restart Server

The **⟳ Restart Server** button in the header restarts the Node process in place and refreshes the dashboard automatically when it comes back online.

---

## Environments

| Name | Alias | URL |
|------|-------|-----|
| `local` | — | https://authorities.lndo.site |
| `dev` | — | https://dev-authorities.pantheonsite.io |
| `test` | `staging` | https://test-authorities.pantheonsite.io |
| `live` | `prod` | https://attorneyatlawmagazine.com |

---

## Running Tests (CLI)

Each npm script captures fresh reference screenshots from the first environment and immediately compares them against the second.

```bash
npm run compare:local-dev    # local  → dev
npm run compare:dev-test     # dev    → test
npm run compare:test-live    # test   → live
```

Or call the script directly with any environment pair:

```bash
./compare.sh <ref_env> <test_env>

# Examples
./compare.sh local dev
./compare.sh dev test
./compare.sh test live
```

### What happens when you run a comparison

1. **Reference** — screenshots are captured from `<ref_env>` and saved as the baseline
2. **Test** — screenshots are captured from `<test_env>` and compared against the baseline
3. **Report** — an HTML report is generated showing pass/fail with side-by-side diffs

> "Mismatch errors found" at the end is normal — it just means differences were detected. Open the HTML report to review them.

---

## Reviewing Results

After a run, open the HTML report for that pair:

```
backstop_data/<ref>-vs-<test>/html_report/index.html
```

The report shows each scenario and viewport with:
- **Pass** — screenshots match within the threshold
- **Fail** — screenshots differ; click to see the diff overlay

The dashboard's **View Report** button opens this directly in a new tab.

---

## Approving Changes

If the diffs are expected (e.g. intentional design changes), approve them to promote the test screenshots as the new reference:

```bash
npx backstop approve --config=backstop.config.js --ref=local --test=dev
```

Adjust `--ref` and `--test` to match the pair you want to approve.

---

## Managing Pages

### Via the Dashboard

Use the **Pages Being Tested** table to add, tag, and remove pages without touching any files directly.

### Via scenarios.js

All pages are defined in [scenarios.js](scenarios.js). Add a new entry to the array:

```js
{
  label: "Page Label",
  path: "/your-page-path",
}
```

The `path` is appended to each environment's base URL automatically.

### Tags

Pages can be tagged to allow running subsets of the test suite:

```js
{
  label: "Best Attorneys Canada",
  path: "/best-attorneys/canada",
  tags: ["canada"],
}
```

Multiple tags are supported: `tags: ["canada", "personal-injury"]`

Tags can be added and edited from the dashboard without editing the file.

### Per-page options

| Option | Type | Description |
|--------|------|-------------|
| `tags` | string[] | Tag this page for filtered runs (e.g. `["canada"]`) |
| `delay` | number (ms) | Extra wait after page load (default: 1500ms) |
| `selectors` | string[] | Only screenshot these CSS selectors instead of the full page |
| `hideSelectors` | string[] | Hide elements (set `visibility: hidden`) before screenshotting |
| `removeSelectors` | string[] | Remove elements from the DOM before screenshotting |
| `readySelector` | string | Wait for this CSS selector to appear before screenshotting |

**Example with overrides:**

```js
{
  label: "Homepage",
  path: "/",
  tags: ["usa"],
  delay: 3000,
  hideSelectors: [".live-chat-widget"],
  removeSelectors: ["#some-ad-unit"],
}
```

---

## Filtering to Specific Pages (CLI)

To run a comparison against only pages matching a tag, use the dashboard's tag filter. From the CLI, use the `--filter` flag with a regex matched against scenario labels:

```bash
./compare.sh local dev --filter="Canada"
./compare.sh local dev --filter="Best Attorneys"
```

---

## Viewports

Screenshots are taken at three widths for every scenario:

| Label | Width | Height |
|-------|-------|--------|
| desktop | 1920px | 1080px |
| tablet | 1024px | 768px |
| mobile | 375px | 812px |

Viewports are configured in [backstop.config.js](backstop.config.js).

---

## How It Works

### Cookie/banner suppression
`onBefore.js` sets cookies before each page loads to automatically dismiss cookie consent banners so they don't appear in screenshots.

### Animation freezing & lazy image loading
`onReady.js` runs after each page loads and:
1. Freezes all CSS animations and transitions to prevent false diffs from motion
2. Scrolls the full page to trigger any lazy-loaded images
3. Waits for all images to finish loading before the screenshot is taken

### Elements removed globally
These selectors are removed from every screenshot (configured in `backstop.config.js`):
- `#onetrust-consent-sdk`
- `#onetrust-banner-sdk`
- `.cookie-banner`
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
    │       └── onReady.js                # Freezes animations, loads lazy images
    ├── quick-runs/                        # One-time Quick Test results
    │   └── quick-<timestamp>/
    │       └── html_report/
    └── <ref>-vs-<test>/                  # Saved comparison pair results
        ├── bitmaps_reference/            # Baseline screenshots
        ├── bitmaps_test/                 # Latest test screenshots
        └── html_report/                  # Visual diff report
```
