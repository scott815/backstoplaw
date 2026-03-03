/**
 * Page definitions — single source of truth for all scenarios.
 *
 * Each entry becomes a BackstopJS scenario. To add a page, just append
 * another object. Per-page overrides (delay, selectors, etc.) are merged
 * into the scenario defaults defined in backstop.config.js.
 */
module.exports = [
  {"label":"Best Attorneys","path":"/best-attorneys","tags":["usa"]},
  {"label":"Best Attorneys Canada","path":"/best-attorneys/canada","tags":["canada"]},
  {"label":"Best Attorneys Personal Injury","path":"/best-attorneys/personal-injury","tags":["usa"]},
  {"label":"Best Attorneys Canada Personal Injury","path":"/best-attorneys/canada/personal-injury","tags":["canada"]},
  {"label":"Best attorney USA State - arizona","path":"/best-attorneys/arizona","tags":["usa"]},
  {"label":"Canada by Providence of Ontario","path":"/best-attorneys/canada/ontario","tags":["canada"]},
  {"label":"Phoenix Attorneys","path":"/best-attorneys/arizona/phoenix","tags":["usa"]},
  {"label":"Attorneys in Toronto, Ontario","path":"/best-attorneys/canada/ontario/toronto","tags":["canada"]},
];
