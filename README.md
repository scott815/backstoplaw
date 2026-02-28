# Visual Regression Testing — BackstopJS

Compares screenshots across environments to catch unintended visual changes.

## Dashboard

A local web dashboard lets you view past results and trigger new runs from a browser.

```bash
npm start
# → BackstopJS Dashboard → http://localhost:3000
```

The dashboard shows a card for each comparison pair with pass/fail counts, the last run time, and two buttons:
- **View Report** — opens the full BackstopJS HTML diff report in a new tab
- **Run** — captures fresh reference screenshots and runs a comparison, streaming live output to the console below the cards

---

## Environments

| Name | Alias | URL |
|------|-------|-----|
| `local` | — | https://authorities.lndo.site |
| `dev` | — | https://dev-authorities.pantheonsite.io |
| `test` | `staging` | https://test-authorities.pantheonsite.io |
| `live` | `prod` | https://attorneyatlawmagazine.com |

---

## Running Tests

Each npm script captures fresh reference screenshots from the first environment and then immediately compares them against the second.

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
3. **Report** — an HTML report opens showing pass/fail with side-by-side diffs

> "Mismatch errors found" at the end is normal — it just means differences were detected. Open the HTML report to review them.

---

## Reviewing Results

After a run, open the HTML report for that pair:

```
backstop_data/<ref>-vs-<test>/html_report/index.html
```

For example, after `compare:local-dev`:

```
backstop_data/local-vs-dev/html_report/index.html
```

The report shows each scenario and viewport with:
- **Pass** — screenshots match within the threshold
- **Fail** — screenshots differ; click to see the diff overlay

---

## Approving Changes

If the diffs in the report are expected (e.g. intentional design changes), approve them to promote the test screenshots as the new reference:

```bash
npx backstop approve --config=backstop.config.js --ref=local --test=dev
```

Adjust `--ref` and `--test` to match the pair you want to approve.

---

## Adding Pages

All pages are defined in [scenarios.js](scenarios.js). Add a new entry to the array:

```js
{
  label: "Page Label",
  path: "/your-page-path",
}
```

The `path` is appended to each environment's base URL automatically.

### Per-page options

Any of these can be added to a scenario object:

| Option | Type | Description |
|--------|------|-------------|
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
  delay: 3000,
  hideSelectors: [".live-chat-widget"],
  removeSelectors: ["#some-ad-unit"],
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

## Filtering to Specific Pages

To run a test against only one page, use the `--filter` flag with the scenario label:

```bash
./compare.sh local dev --filter="Best Attorneys"
```

The filter is a regex matched against the scenario `label` field.

---

## Project Structure

```
backstopjs/
├── scenarios.js                        # Page definitions (edit this to add pages)
├── backstop.config.js                  # BackstopJS configuration
├── compare.sh                          # Wrapper script for reference + test
├── package.json
└── backstop_data/
    ├── engine_scripts/
    │   └── puppet/
    │       ├── onBefore.js             # Sets cookies before page load
    │       └── onReady.js              # Freezes animations, loads lazy images
    └── <ref>-vs-<test>/
        ├── bitmaps_reference/          # Baseline screenshots
        ├── bitmaps_test/               # Latest test screenshots
        └── html_report/               # Visual diff report
```
