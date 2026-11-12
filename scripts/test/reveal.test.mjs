import assert from 'node:assert/strict';
import test from 'node:test';

import { revealDeferredContent } from '../lib/reveal.mjs';

// 1x1 transparent PNG served for the lazy image.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('deferred sections render, lazy images load their real source and delayed scripts run', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route('https://reference.test/**', (route) => route.request().url().endsWith('.png')
      ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
      : route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><body style="margin:0">
          <div style="height:3000px"></div>
          <section id="deferred" style="content-visibility:auto;contain-intrinsic-size:1px 100px"><div style="height:900px"></div></section>
          <img id="lazy" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E" data-lazy-src="https://reference.test/photo.png" width="10" height="10">
          <img id="plain" data-src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="10" height="10">
          <script>addEventListener('mousemove', () => { document.body.dataset.delayedScripts = 'ran'; }, { once: true });</script>
        </body>` }));
    await page.goto('https://reference.test/');
    assert.equal(await page.$eval('#deferred', (element) => element.getBoundingClientRect().height), 100);

    const promoted = await revealDeferredContent(page);

    assert.equal(promoted, 1, 'data: placeholders are not promoted');
    assert.equal(await page.$eval('body', (body) => body.dataset.delayedScripts), 'ran');
    assert.equal(await page.$eval('#deferred', (element) => element.getBoundingClientRect().height), 900);
    assert.equal(await page.$eval('#lazy', (image) => image.currentSrc), 'https://reference.test/photo.png');
    assert.equal(await page.$eval('#lazy', (image) => image.complete && image.naturalWidth), 1);
  } finally {
    await browser.close();
  }
});
