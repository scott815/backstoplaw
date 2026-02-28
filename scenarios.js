/**
 * Page definitions — single source of truth for all scenarios.
 *
 * Each entry becomes a BackstopJS scenario. To add a page, just append
 * another object. Per-page overrides (delay, selectors, etc.) are merged
 * into the scenario defaults defined in backstop.config.js.
 */
module.exports = [
  {
    label: "Best Attorneys",
    path: "/best-attorneys",
  },
  {
    label: "Best Attorneys Canada",
    path: "/best-attorneys/canada",
  },
  {
    label: "Best Attorneys Personal Injury",
    path: "/best-attorneys/personal-injury",
  },
  {
    label: "Best Attorneys Canada Personal Injury",
    path: "/best-attorneys/canada/personal-injury",
  },
];
