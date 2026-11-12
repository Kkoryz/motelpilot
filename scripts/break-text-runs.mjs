#!/usr/bin/env node

// The layout audit's density failures a rule can fix (site:run step "audits", before any agent repair): a page whose
// text runs on longer than the competitor's longest (density_long_text_run) or that shows less photo than the
// competitor's least (density_too_few_images) gets one more photo row, placed in its longest run of photo-less
// sections (lib/media-slots.mjs withMediaModules), up to MAX_BREAKS a page; a page that shows more than the
// competitor's most (density_too_many_images) loses one: an extra row first, then one of the competitor's photo walls
// (a negative count, down to -MAX_BREAKS). Exit 0 when a page changed, 2 when there was nothing more to change (the
// failures go on to the agent repair or a person).
// A site planned to its density band (components.densityBands: the visual budget, lib/visual-budget.mjs) is not fixed
// page by page (owner 2026-11-12: the audit verifies): on a density failure the block model is fitted again from the
// audit's measured blocks (components.blockModel), and the pages are planned again only when the model moved.
// Usage: node scripts/break-text-runs.mjs

import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { DEFAULT_BLOCK_MODEL, fitBlockModel } from './lib/visual-budget.mjs';

export const MAX_BREAKS = 3;
const ISSUES = new Set(['density_long_text_run', 'density_too_few_images']);
const TOO_MANY = 'density_too_many_images';

// The new photoBreaks from the audit's failures and the current ones.
export function addBreaks(failures = [], current = {}) {
  const routes = [...new Set(failures.filter((failure) => ISSUES.has(failure.issue)).map((failure) => failure.route))];
  const crowded = [...new Set(failures.filter((failure) => failure.issue === TOO_MANY).map((failure) => failure.route))].filter((route) => !routes.includes(route));
  const next = { ...current };
  const more = routes.filter((route) => (current[route] ?? 0) < MAX_BREAKS);
  const fewer = crowded.filter((route) => (current[route] ?? 0) > -MAX_BREAKS);
  for (const route of more) next[route] = (current[route] ?? 0) + 1;
  for (const route of fewer) next[route] = (current[route] ?? 0) - 1;
  return { breaks: next, added: [...more, ...fewer] };
}

// Whether a fitted model differs from the one in use enough to plan again: a module 15% taller or shorter at its usual
// length, or its picture share 0.1 apart.
export function modelMoved(previous = DEFAULT_BLOCK_MODEL, next = DEFAULT_BLOCK_MODEL) {
  return Object.entries(next).some(([key, fit]) => {
    const was = previous[key];
    if (!was) return true;
    const at = (model) => model.base + model.perWord * 120;
    return Math.abs(at(fit) - at(was)) > 0.15 * at(was) || Math.abs(fit.visual - was.visual) > 0.1;
  });
}

const DENSITY_ISSUES = new Set([...ISSUES, TOO_MANY]);

export async function breakTextRuns({ root = process.cwd() } = {}) {
  const audit = await readJson(resolve(root, 'docs/research/authoring-layout-audit.json'), { failures: [] });
  const path = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(path);
  if (variants.components.densityBands) {
    // Density is reported as warnings (audit-authoring-layout.mjs): a page off the band still refits the model.
    if (![...audit.failures, ...(audit.warnings ?? [])].some((failure) => DENSITY_ISSUES.has(failure.issue))) return [];
    const samples = (audit.results ?? []).flatMap((result) => result.blockMetrics ?? []);
    const current = { ...DEFAULT_BLOCK_MODEL, ...variants.components.blockModel };
    const fitted = fitBlockModel(samples, current);
    if (!samples.length || !modelMoved(current, fitted)) return [];
    variants.components.blockModel = fitted;
    await writeJson(path, variants);
    return ['block model'];
  }
  // Run scripts write only the keys they derive (here photoBreaks); every other key is the treatment's or a repair's.
  const { breaks, added } = addBreaks(audit.failures, variants.components.photoBreaks ?? {});
  if (added.length) {
    variants.components.photoBreaks = breaks;
    await writeJson(path, variants);
  }
  return added;
}

runMain(import.meta.url, async () => {
  const added = await breakTextRuns();
  console.log(added.length ? `planned again: ${added.join(', ')}` : 'nothing to plan again');
  process.exitCode = added.length ? 0 : 2;
});
