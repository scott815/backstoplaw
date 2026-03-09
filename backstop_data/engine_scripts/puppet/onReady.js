/**
 * onReady — runs after the page has loaded.
 *
 * 1. Freezes CSS animations and transitions to prevent false diffs.
 * 2. Scrolls the page to trigger lazy-loaded images, then scrolls back.
 * 3. Waits for all images to finish loading.
 */
module.exports = async (page, scenario) => {
  // 0. Dismiss the "Continue" gate if present (dev/test/liveV2 only)
  const continueBtn = await page.$('button.pds-button');
  if (continueBtn) {
    await continueBtn.click();
    await new Promise((r) => setTimeout(r, 2000)); // wait for transition
  }

  // 1. Freeze all animations and transitions
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);
  });

  // 2. Scroll down in steps to trigger lazy-loaded images
  await page.evaluate(async () => {
    const distance = 400;
    const pause = 100;
    const scrollHeight = document.body.scrollHeight;

    for (let pos = 0; pos < scrollHeight; pos += distance) {
      window.scrollTo(0, pos);
      await new Promise((r) => setTimeout(r, pause));
    }

    // Scroll back to the top
    window.scrollTo(0, 0);
  });

  // 3. Wait for all images to finish loading
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      images
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            })
        )
    );
  });

  // Small extra buffer for any remaining rendering
  await new Promise((r) => setTimeout(r, 500));
};
