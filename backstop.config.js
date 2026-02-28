const minimist = require("minimist");
const scenarios = require("./scenarios");

const args = minimist(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Environment map (with aliases)
// ---------------------------------------------------------------------------
const environments = {
  local: "https://authorities.lndo.site",
  dev: "https://dev-authorities.pantheonsite.io",
  test: "https://test-authorities.pantheonsite.io",
  staging: "https://test-authorities.pantheonsite.io",
  live: "https://attorneyatlawmagazine.com",
  prod: "https://attorneyatlawmagazine.com",
};

// ---------------------------------------------------------------------------
// Resolve ref / test environments
// ---------------------------------------------------------------------------
const refName = args.ref || "local";
const testName = args.test || "dev";

const refBase = environments[refName];
const testBase = environments[testName];

if (!refBase) {
  throw new Error(
    `Unknown ref environment "${refName}". Valid: ${Object.keys(environments).join(", ")}`
  );
}
if (!testBase) {
  throw new Error(
    `Unknown test environment "${testName}". Valid: ${Object.keys(environments).join(", ")}`
  );
}

// Canonical names (resolve aliases for directory naming)
const canonical = { staging: "test", prod: "live" };
const refCanonical = canonical[refName] || refName;
const testCanonical = canonical[testName] || testName;
const pairName = `${refCanonical}-vs-${testCanonical}`;

// ---------------------------------------------------------------------------
// Build scenarios from the shared page list
// ---------------------------------------------------------------------------
const builtScenarios = scenarios.map((page) => ({
  label: page.label,
  url: testBase + page.path,
  referenceUrl: refBase + page.path,
  // Per-page overrides
  ...(page.delay != null && { delay: page.delay }),
  ...(page.selectors && { selectors: page.selectors }),
  ...(page.hideSelectors && { hideSelectors: page.hideSelectors }),
  ...(page.removeSelectors && { removeSelectors: page.removeSelectors }),
  ...(page.readySelector && { readySelector: page.readySelector }),
}));

// ---------------------------------------------------------------------------
// BackstopJS configuration
// ---------------------------------------------------------------------------
module.exports = {
  id: pairName,
  engine: "puppeteer",

  viewports: [
    { label: "desktop", width: 1920, height: 1080 },
    { label: "tablet", width: 1024, height: 768 },
    { label: "mobile", width: 375, height: 812 },
  ],

  scenarios: builtScenarios,

  scenarioDefaults: {
    delay: 1500,
    misMatchThreshold: 0.1,
    requireSameDimensions: false,
    selectorExpansion: true,
    selectors: ["document"],
    removeSelectors: [
      "#onetrust-consent-sdk",
      "#onetrust-banner-sdk",
      ".cookie-banner",
      "[id*='cookie']",
      "[class*='cookie-consent']",
      "iframe[src*='doubleclick']",
      "iframe[src*='googlesyndication']",
      "iframe[src*='adservice']",
    ],
  },

  onBeforeScript: "puppet/onBefore.js",
  onReadyScript: "puppet/onReady.js",

  paths: {
    bitmaps_reference: `backstop_data/${pairName}/bitmaps_reference`,
    bitmaps_test: `backstop_data/${pairName}/bitmaps_test`,
    engine_scripts: "backstop_data/engine_scripts",
    html_report: `backstop_data/${pairName}/html_report`,
    ci_report: `backstop_data/${pairName}/ci_report`,
  },

  engineOptions: {
    ignoreHTTPSErrors: true,
    args: ["--no-sandbox"],
  },

  asyncCaptureLimit: 3,
  asyncCompareLimit: 10,
  debug: false,
  debugWindow: false,
};
