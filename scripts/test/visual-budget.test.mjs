import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateBlock, fitBlockModel, pageEstimate, planVisualBudget, varyItemRows } from '../lib/visual-budget.mjs';
import { modelMoved } from '../break-text-runs.mjs';

const model = {
  'intro:text': { base: 200, perWord: 3, visual: 0, before: 1, after: 1 },
  'gallery:band': { base: 720, perWord: 0, visual: 0.86, before: 0.08, after: 0.08 },
  'relatedPages:tiles': { base: 480, perWord: 0, visual: 0.6, before: 0.2, after: 0.2 },
  'cta:form': { base: 750, perWord: 0, visual: 0.2, before: 0.7, after: 0.7 },
  '*': { base: 200, perWord: 4, visual: 0, before: 1, after: 1 },
};
const bands = { wordsPer1000px: { max: 166 }, visualAreaPct: { min: 19, max: 43 }, longestTextOnlyPx: { max: 2467 } };
const text = (id, words) => ({ id, type: 'intro', heading: id, words });
const helpers = (extra = {}) => ({ bands, model, variantOf: (block) => ({ intro: 'text', gallery: 'band', relatedPages: block.variant ?? 'tiles', cta: 'form' })[block.type], wordsOf: (block) => block.words ?? 0, wall: (id) => ({ id, type: 'gallery', variant: 'band', items: [{}] }), isWall: (block) => String(block.id).startsWith('media-module-'), ...extra });

test('a block\'s estimate follows its words; a page\'s run ends at a picture', () => {
  assert.equal(estimateBlock({ type: 'intro' }, 'text', 100, model).height, 500);
  assert.equal(estimateBlock({ type: 'unknown' }, null, 50, model).height, 400, 'an unknown module is text by the fallback');
  const page = pageEstimate([{ height: 1000, visual: 0, before: 1000, after: 1000, pictured: false }, { height: 720, visual: 620, before: 60, after: 60, pictured: true }, { height: 500, visual: 0, before: 500, after: 500, pictured: false }]);
  assert.deepEqual([page.height, Math.round(page.visualPct), page.longestRun], [2220, 28, 1060]);
});

test('a page is planned to its band: walls where its copy runs on, none on a short page, tiles give way on a crowded one', () => {
  // Eight sections of 300 words each (1,100px apiece): one picture-less run of 8,800px gets walls until no run is too long.
  const long = [...Array.from({ length: 8 }, (_, index) => text(`s${index}`, 300)), { id: 'cta', type: 'cta' }];
  const planned = planVisualBudget(long, helpers());
  const walls = planned.filter((block) => block.type === 'gallery').length;
  assert.ok(walls >= 3, `walls: ${walls}`);
  const estimate = pageEstimate(planned.map((block) => estimateBlock(block, helpers().variantOf(block), block.words ?? 0, model)));
  assert.ok(estimate.longestRun <= bands.longestTextOnlyPx.max, `longest run ${estimate.longestRun}`);
  // A short page with photo tiles and a photo closing band shows too much: its tiles become links, no wall goes in.
  const crowded = { ...model, 'relatedPages:tiles': { ...model['relatedPages:tiles'], visual: 0.9 }, 'cta:form': { ...model['cta:form'], visual: 0.4 } };
  const short = planVisualBudget([text('a', 20), { id: 'related', type: 'relatedPages' }, { id: 'cta', type: 'cta' }], helpers({ model: crowded }));
  assert.equal(short.filter((block) => block.type === 'gallery').length, 0);
  assert.equal(short.find((block) => block.type === 'relatedPages').variant, 'links');
});

test('the block model is fitted from measured blocks, and a moved model plans the pages again', () => {
  const samples = [100, 200, 300].map((words) => ({ key: 'intro:text', words, height: 150 + 3 * words, visualShare: 0, before: 150 + 3 * words, after: 150 + 3 * words }));
  const fitted = fitBlockModel(samples, model);
  assert.deepEqual(fitted['intro:text'], { base: 150, perWord: 3, visual: 0, before: 1, after: 1 });
  assert.equal(fitted['gallery:band'], model['gallery:band'], 'a module the site does not show keeps its default');
  assert.equal(modelMoved(model, model), false);
  assert.equal(modelMoved(model, { ...model, 'intro:text': { ...model['intro:text'], base: 400 } }), true);
});

test('a module a page type styles its own way is estimated by that page type\'s fit', () => {
  const samples = [
    ...['/a/', '/b/', '/c/'].map(() => ({ key: 'cta:form+photo', pageType: 'solution', words: 15, height: 665, visualShare: 0, before: 665, after: 665 })),
    ...['/d/', '/e/', '/f/'].map(() => ({ key: 'cta:form+photo', pageType: 'general', words: 40, height: 958, visualShare: 0.64, before: 140, after: 200 })),
  ];
  const fitted = fitBlockModel(samples, model);
  assert.equal(estimateBlock({ type: 'cta' }, 'form+photo', 15, fitted, 'solution').visual, 0);
  assert.ok(estimateBlock({ type: 'cta' }, 'form+photo', 40, fitted, 'general').visual > 600);
});

test('two rows of short items never stand together: the card grid of the pair becomes a list beside its heading', () => {
  const grid = (id) => ({ id, type: 'featureGrid', heading: id });
  // The hotel home: icon cards, a photo, icon cards, icon cards, steps.
  const blocks = [grid('a'), { id: 'photo', type: 'figure' }, grid('b'), grid('c'), { id: 'steps', type: 'process' }, { id: 'x', type: 'faq' }, { id: 'n', type: 'stats' }, grid('d')];
  const variantOf = (block) => (block.planned ? block.variant : block.type === 'featureGrid' ? 'icons' : undefined);
  assert.deepEqual(varyItemRows(blocks, variantOf).map((block) => variantOf(block) ?? block.type), ['icons', 'figure', 'icons', 'bullets', 'process', 'faq', 'stats', 'bullets']);
  // Steps right after a grid: the grid goes, unless the block before it is a list already.
  const steps = [grid('e'), { id: 's', type: 'process' }];
  assert.deepEqual(varyItemRows(steps, variantOf).map((block) => variantOf(block) ?? block.type), ['bullets', 'process']);
});
