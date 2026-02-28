/**
 * onBefore — runs before the page loads.
 *
 * Sets cookies to dismiss common consent / cookie banners so they don't
 * appear in screenshots.
 */
module.exports = async (page, scenario) => {
  const url = scenario.url || scenario.referenceUrl;
  const { hostname } = new URL(url);

  await page.setCookie(
    {
      name: "OptanonAlertBoxClosed",
      value: new Date().toISOString(),
      domain: hostname,
      path: "/",
    },
    {
      name: "cookie-agreed",
      value: "2",
      domain: hostname,
      path: "/",
    }
  );
};
