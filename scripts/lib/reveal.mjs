// Makes a reference page render what a visitor sees after scrolling, before it is measured or screenshotted:
//  - `content-visibility: auto` (e.g. WP Rocket lazy render) skips painting off-screen sections, which collapses
//    them in full-page screenshots and in getBoundingClientRect;
//  - lazy-load plugins keep the real image in data-* attributes until their scroll handler fires;
//  - delayed page scripts wait for a first user interaction.
// Only the local capture browser is changed; nothing is sent to the site.

const LAZY_ATTRIBUTES = [
  ['data-lazy-src', 'src'], ['data-src', 'src'],
  ['data-lazy-srcset', 'srcset'], ['data-srcset', 'srcset'],
  ['data-lazy-sizes', 'sizes'], ['data-sizes', 'sizes'],
];

// Scrolls through the whole page once so scroll-triggered content loads, then returns to the top and lets scroll
// handlers settle (a header that turns fixed after scrolling must be measured in its top-of-page state).
// Every capture and measurement uses this one routine so they see the same page.
export async function scrollThroughPage(page, { delay = 60, settle = 600 } = {}) {
  await page.evaluate(async ({ delay, settle }) => {
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    document.documentElement.style.scrollBehavior = 'auto';
    const step = Math.max(400, Math.floor(innerHeight * 0.75));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await wait(delay); }
    scrollTo(0, 0);
    await document.fonts?.ready;
    await wait(settle);
  }, { delay, settle });
}

export async function revealDeferredContent(page) {
  // "Delay JavaScript" optimisers (WP Rocket, Perfmatters, Flying Scripts) run page scripts such as carousels only
  // after the first user interaction; a visitor triggers that at once, so the capture does too.
  await page.mouse.move(2, 2);
  await page.mouse.move(6, 6);
  await page.mouse.wheel(0, 1);
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0));
  await page.addStyleTag({ content: '*, *::before, *::after { content-visibility: visible !important; }' }).catch(() => {});
  const promoted = await page.evaluate((pairs) => {
    let count = 0;
    for (const element of document.querySelectorAll('img, source, iframe')) {
      for (const [from, to] of pairs) {
        const value = element.getAttribute(from);
        if (!value || value.startsWith('data:') || element.getAttribute(to) === value) continue;
        if (to === 'sizes' && value === 'auto') continue;
        element.setAttribute(to, value);
        if (element.localName === 'img') element.loading = 'eager';
        count += 1;
      }
    }
    return count;
  }, LAZY_ATTRIBUTES);
  // waitForLoadState resolves at once when the page already reached networkidle, so wait on the images themselves.
  if (promoted) {
    await page.evaluate(() => Promise.race([
      Promise.all([...document.images].filter((image) => !image.complete).map((image) => new Promise((done) => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); }))),
      new Promise((done) => setTimeout(done, 15000)),
    ])).catch(() => {});
  }
  return promoted;
}
