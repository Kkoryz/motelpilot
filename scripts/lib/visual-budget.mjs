// The visual budget (owner 2026-11-12: the photos follow the content, decided when the page is planned, the audit only
// checks): each page's height, picture share and longest picture-less run estimated from its sections before it is
// built, and photo walls added or taken off until the estimate sits inside the reference's density band
// (components.densityBands, measure-reference-density.mjs). How tall a module renders and how much of it is picture
// comes from the block model (config/block-model.default.json, calibrated per site from its layout audit:
// components.blockModel, calibrate-block-model in break-text-runs.mjs).

import defaults from '../../config/block-model.default.json' with { type: 'json' };

export const DEFAULT_BLOCK_MODEL = defaults.modules;
// The estimate aims inside the band, not at its edges: the model is a fit, the audit measures the real page.
export const BUDGET_MARGIN = Object.freeze({ run: 0.9, visualPct: 3 });
export const MAX_BUDGET_WALLS = 12;

// The model key of a block: its type and the variant it renders with (featureGrid: its pattern).
export const modelKey = (block, variant) => `${block.type}:${variant ?? ''}`;

// One block's estimate: { height, visual (px of picture area, page-wide), before, after (text-only px at its top and
// bottom; a block with no picture is text throughout) }.
// A page type may style a module its own way (the hotel site's service pages hide the closing band's photo): its
// fit for that page type (key@pageType) comes first.
export function estimateBlock(block, variant, words, model = DEFAULT_BLOCK_MODEL, pageType = null) {
  // A variant the model has not seen takes its module's average (type:*), then the module without a variant.
  const fit = (pageType ? model[`${modelKey(block, variant)}@${pageType}`] : null) ?? model[modelKey(block, variant)] ?? model[`${block.type}:*`] ?? model[`${block.type}:`] ?? model['*'] ?? DEFAULT_BLOCK_MODEL['*'];
  const height = Math.max(40, fit.base + fit.perWord * words);
  const pictured = fit.visual > 0.05;
  return { height, visual: fit.visual * height, before: pictured ? fit.before * height : height, after: pictured ? fit.after * height : height, pictured };
}

// A page's estimated density from its blocks' estimates in order (the hero first): content height, picture share (%)
// and the longest picture-less run (px), as lib/density.mjs measures the built page.
export function pageEstimate(estimates) {
  let height = 0;
  let visual = 0;
  let run = 0;
  let longest = 0;
  for (const item of estimates) {
    height += item.height;
    visual += item.visual;
    if (item.pictured) { longest = Math.max(longest, run + item.before); run = item.after; } else run += item.height;
  }
  longest = Math.max(longest, run);
  return { height, visualPct: height ? (100 * visual) / height : 0, longestRun: longest };
}

// Plans a page's photo walls to its budget. blocks: the page's blocks with the reference's walls already in place;
// helpers: variantOf(block), wordsOf(block), wall(id) (a new wall of the reference's kind), isWall(block), hero ({ block,
// variant, words } of the page's hero, or null). floor: the competitor's signature bands on this page type
// (pattern-map signatureBands; the walls marked signature). Returns the blocks, walls added where the copy runs on or
// the page shows too little; where it shows too much, in this order (owner 2026-11-12: the competitor's own photo
// bands go last, and never below its count): the walls added here, the photos of photo cards (icon cards instead),
// photo tiles (links instead), the competitor's other walls, then its bands down to the floor.
export function planVisualBudget(blocks, { bands, model = DEFAULT_BLOCK_MODEL, variantOf, wordsOf, wall, isWall, hero = null, pageType = null, floor = 0 }) {
  const target = { run: bands.longestTextOnlyPx.max * BUDGET_MARGIN.run, min: bands.visualAreaPct.min + BUDGET_MARGIN.visualPct, max: bands.visualAreaPct.max - BUDGET_MARGIN.visualPct };
  const estimates = () => blocks.map((block) => estimateBlock(block, variantOf(block), wordsOf(block), model, pageType));
  const top = hero ? estimateBlock(hero.block, hero.variant, hero.words, model, pageType) : null;
  const measure = () => pageEstimate([...(top ? [top] : []), ...estimates()]);
  const closing = () => { const at = blocks.findIndex((block) => block.type === 'cta' || block.type === 'form'); return at < 0 ? blocks.length : at; };
  // The text runs between pictured blocks, before the closing call: { start, end, height } over block indexes, the
  // height counted as the page is measured: the text below the picture before the run and above the one after it too.
  const runs = () => {
    const list = estimates();
    const body = closing();
    const found = [];
    for (let start = 0; start < body;) {
      if (list[start].pictured) { start += 1; continue; }
      let end = start;
      while (end < body && !list[end].pictured) end += 1;
      const above = start > 0 ? list[start - 1].after : top?.after ?? 0;
      const below = end < list.length ? list[end].before : 0;
      found.push({ start, end, height: above + list.slice(start, end).reduce((sum, item) => sum + item.height, 0) + below });
      start = end;
    }
    return found;
  };
  // Where a wall may go in a run: between two of its blocks, else at its edge (next to a pictured block), never next to
  // another wall; the place that splits the run's height most evenly.
  const place = (run) => {
    const list = estimates();
    const candidates = [];
    for (let at = run.start; at <= run.end; at += 1) {
      if (at === 0 || at > closing()) continue;
      if (isWall(blocks[at - 1]) || (blocks[at] && isWall(blocks[at]))) continue;
      candidates.push(at);
    }
    const above = (at) => list.slice(run.start, at).reduce((sum, item) => sum + item.height, 0);
    return candidates.sort((left, right) => Math.abs(2 * above(left) - run.height) - Math.abs(2 * above(right) - run.height))[0];
  };
  let added = 0;
  for (; added < MAX_BUDGET_WALLS; added += 1) {
    const now = measure();
    const longest = runs().sort((left, right) => right.height - left.height);
    // A run too long is split (one inside a single section cannot be); a page short of pictures gets one in its longest run.
    const needed = (now.longestRun > target.run ? longest.find((run) => run.end - run.start >= 2 && run.height > target.run) : null) ?? (now.visualPct < target.min ? longest[0] : null);
    if (!needed) break;
    const at = place(needed);
    if (at === undefined) break;
    blocks.splice(at, 0, wall(`media-module-budget-${added + 1}`));
  }
  const over = () => measure().visualPct > target.max;
  // Walls come off (the last first) while the runs stay within the band; allowed: whether one more may go.
  const takeOff = (which, allowed = () => true) => {
    while (over() && allowed()) {
      const index = blocks.findLastIndex((block) => isWall(block) && which(block));
      if (index < 0) return;
      const [removed] = blocks.splice(index, 1);
      if (measure().longestRun > target.run) { blocks.splice(index, 0, removed); return; }
    }
  };
  takeOff((block) => !block.competitor);
  // Photo cards show icons instead (the last grid first); planned: the page's own variant (resolveVariant).
  for (let index = blocks.length - 1; index >= 0 && over(); index -= 1) if (blocks[index].type === 'featureGrid' && variantOf(blocks[index]) === 'media') blocks[index] = { ...blocks[index], variant: 'icons', planned: true };
  if (over()) for (const [index, block] of blocks.entries()) if (block.type === 'relatedPages' && variantOf(block) === 'tiles') blocks[index] = { ...block, variant: 'links', planned: true };
  takeOff((block) => block.competitor && !block.signature);
  takeOff((block) => block.signature, () => blocks.filter((block) => isWall(block) && block.signature).length > floor);
  return varyItemRows(blocks, variantOf);
}

// Two sections of the same shape never stand together (owner 2026-11-12: "图标得穿插 元素堆一起是不是不好看", "同类型模块
// 堆在一起这个得在最开始就避免": the hotel home ran three rows of three short items, icon cards, icon cards and steps, one
// under the other). A row of short items is a card grid (any but the list), steps (any but the list) or figures; where
// two meet, the card grid of the pair sets its points out as a list beside its heading (bullets, the competitor's
// service lists), the later one first. Planned with the page, before anything is built or photographed.
const itemRow = (block, variant) => (block.type === 'featureGrid' && variant !== 'bullets') || (block.type === 'process' && variant !== 'list') || block.type === 'stats';
export function varyItemRows(blocks, variantOf) {
  const toList = (index) => { blocks[index] = { ...blocks[index], variant: 'bullets', planned: true }; };
  for (let index = 1; index < blocks.length; index += 1) {
    const [before, block] = [blocks[index - 1], blocks[index]];
    if (!itemRow(before, variantOf(before)) || !itemRow(block, variantOf(block))) continue;
    if (block.type === 'featureGrid') toList(index);
    else if (before.type === 'featureGrid' && !(index >= 2 && blocks[index - 2].type === 'featureGrid' && variantOf(blocks[index - 2]) === 'bullets')) toList(index - 1);
  }
  return blocks;
}

// A block model fitted from a built site's measured blocks (the layout audit's desktop block metrics): per model key a
// least-squares line of height on words, its picture share and text edges; keys with fewer than three samples keep a
// flat height; keys the site does not show keep the defaults.
export function fitBlockModel(samples, base = DEFAULT_BLOCK_MODEL) {
  const groups = {};
  // Each key, and each module over all its variants (type:*).
  for (const sample of samples) {
    (groups[sample.key] ||= []).push(sample);
    (groups[`${sample.key.split(':')[0]}:*`] ||= []).push(sample);
    if (sample.pageType) (groups[`${sample.key}@${sample.pageType}`] ||= []).push(sample);
  }
  const fitted = { ...base };
  for (const [key, list] of Object.entries(groups)) {
    const n = list.length;
    const mean = (pick) => list.reduce((sum, item) => sum + pick(item), 0) / n;
    const [mx, my] = [mean((item) => item.words), mean((item) => item.height)];
    const sxx = list.reduce((sum, item) => sum + (item.words - mx) ** 2, 0);
    const slope = n >= 3 && sxx ? Math.max(0, list.reduce((sum, item) => sum + (item.words - mx) * (item.height - my), 0) / sxx) : 0;
    const share = (pick) => Math.round(Math.min(1, mean(pick)) * 100) / 100;
    fitted[key] = { base: Math.round(Math.max(40, my - slope * mx)), perWord: Math.round(slope * 100) / 100, visual: share((item) => item.visualShare), before: share((item) => item.before / Math.max(1, item.height)), after: share((item) => item.after / Math.max(1, item.height)) };
  }
  return fitted;
}
