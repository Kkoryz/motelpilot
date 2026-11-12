import assert from 'node:assert/strict';
import test from 'node:test';

import { blockVisual, cardGridVariant, cardVisual, tradePhotos, VISUAL_TYPES } from '../lib/slot-visuals.mjs';
import { mediaSlots, pageVisuals, resolveVariant } from '../lib/media-slots.mjs';
import { allocateSite } from '../lib/media-allocation.mjs';
import { planLibrary } from '../lib/image-plan.mjs';
import { briefSlots } from '../lib/photo-briefs.mjs';
import serviceBriefs from '../../config/image-briefs.service.json' with { type: 'json' };
import apparelBriefs from '../../config/image-briefs.json' with { type: 'json' };

const cards = (id, ...headings) => ({ id, type: 'featureGrid', heading: 'What we do', items: headings.map((heading) => ({ heading, paragraphs: ['P'] })) });
const split = (id) => ({ id, type: 'splitMedia', heading: id, paragraphs: ['P'] });
// A home page whose reference design gives cards photos (Concord's home: two photo tiles, media-cards).
const home = { route: '/', pageType: 'home', blocks: [cards('services', 'Revenue management', 'Accounting', 'IT support'), split('story')] };
const scenes = { hero: 'plain', tradePhotos: 'scenes', pageTypes: { home: { featureGrid: 'media', mediaModules: [] } } };
const products = { ...scenes, tradePhotos: undefined };

test('a trade whose photos are scenes gives its cards icons; a product trade keeps photo cards; the site may choose', () => {
  assert.deepEqual(VISUAL_TYPES, ['photo', 'icon', 'data', 'none']);
  assert.equal(tradePhotos(serviceBriefs), 'scenes', 'the service trade photographs scenes of its work');
  assert.equal(tradePhotos(apparelBriefs), undefined, 'the clothing trade photographs its products');
  assert.equal(cardVisual({ tradePhotos: 'scenes' }), 'icon');
  assert.equal(cardVisual({}), 'photo');
  assert.equal(cardVisual({ tradePhotos: 'scenes', cardVisual: 'none' }), 'none', "the site's own choice comes first");
  assert.equal(cardVisual({ cardVisual: 'icon' }), 'icon');
  assert.equal(cardGridVariant('media', { tradePhotos: 'scenes' }), 'icons');
  assert.equal(cardGridVariant('media', { cardVisual: 'none' }), 'cards');
  assert.equal(cardGridVariant('media', {}), 'media');
  assert.equal(cardGridVariant('bullets', { tradePhotos: 'scenes' }), 'bullets', 'a variant without pictures is kept');
});

test("the design's photo cards render as the site's cards: icon cards on a service site, with no photo slot", () => {
  const grid = home.blocks[0];
  assert.equal(resolveVariant(grid, 'home', 0, scenes), 'icons');
  assert.equal(resolveVariant(grid, 'home', 0, products), 'media');
  assert.equal(resolveVariant({ ...grid, variant: 'media' }, 'home', 0, scenes), 'icons', 'a section given photo cards too');
  assert.equal(resolveVariant(grid, 'about', 0, { tradePhotos: 'scenes', featureGridMedia: true }), 'icons', 'the site-wide photo-card switch too');
  assert.equal(resolveVariant(grid, 'home', 0, { ...scenes, pageTypes: { home: { featureGrid: 'media', blocks: { services: { variant: 'media' } } } } }), 'media', "a section's own chosen variant stays");
  assert.deepEqual(mediaSlots(grid, 'icons', scenes), []);
  assert.equal(mediaSlots(grid, 'media', products).length, 3);
});

test('every position of a page is planned as photo, icon, data or none', () => {
  const chart = { ...split('figures'), visuals: [{ type: 'data', data: { shape: 'bars', items: [{ label: 'A', value: 1 }] } }] };
  const page = { ...home, blocks: [...home.blocks, chart, { id: 'faq', type: 'faq', items: [] }] };
  assert.deepEqual(pageVisuals(page, scenes).map((item) => [item.blockId, item.visual]), [['services', 'icon'], ['story', 'photo'], ['figures', 'data'], ['faq', 'none']]);
  assert.equal(pageVisuals(page, products)[0].visual, 'photo');
  assert.equal(blockVisual({ type: 'intro' }, 'text', []), 'none');
});

test('icon cards reach neither the allocation, the image plan nor the photo briefs', () => {
  const pages = [home];
  const requests = (components) => allocateSite({ pages, components: { ...components, media: { placeholders: [] } } }).unfilled.filter((request) => request.blockId === 'services');
  assert.equal(requests(scenes).length, 0);
  assert.equal(requests(products).length, 3);
  const plan = (components, briefs) => planLibrary({ pages, components, line: 'motel', briefs: { ...briefs, placeholderKinds: [] }, styleRefs: { product: [{ path: 'p.jpg', subject: '' }], process: [{ path: 'q.jpg', subject: '' }] } });
  assert.deepEqual(plan(scenes, serviceBriefs).entries.filter((entry) => entry.topic && /Revenue|Accounting|IT/.test(entry.topic)), [], 'no photo is planned for an icon card');
  assert.ok(plan(products, apparelBriefs).entries.some((entry) => entry.topic === 'Revenue management'), 'a photo card gets its topic photo');
  // The photo briefs describe the split row's photo only (cards are never briefed; an icon card has no position at all).
  assert.deepEqual(briefSlots(pages, scenes)['/'].map((slot) => slot.blockId), ['story']);
});
