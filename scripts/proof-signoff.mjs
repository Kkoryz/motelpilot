#!/usr/bin/env node

// Lists the site's stated proof (src/data/site-proof.json: factory figures, certificates, clients, testimonials, case
// studies, history) in the owner's release sign-off (docs/research/release-signoff.json), one item per group, so stage
// 11 holds release until the owner has put in the real values and confirmed each (pnpm signoff --confirm <id>). An item
// whose values changed since it was confirmed is pending again; a group the file no longer has is dropped.
// Usage: node scripts/proof-signoff.mjs

import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { REVIEW_SIGNOFF, reviewSignoffItem } from './lib/review-markup.mjs';
import { PLACEHOLDER_BLOCKS, PROOF_GROUPS, PROOF_SCHEMA, placeholderRoutes, proofGroupBlockId, proofSignoffItems } from './lib/site-proof.mjs';
import { SIGNOFF_SCHEMA } from './signoff.mjs';

// What Site Factory borrowed from competitors (placeholder: true) on the built pages, testimonials and order routes:
// one sign-off item each that the owner confirms to launch with them (the preflight holds until then).
export function placeholderItems(pages) {
  return PLACEHOLDER_BLOCKS.flatMap(({ type, signoff, what }) => {
    const routes = placeholderRoutes(pages, type);
    return routes.length ? [{ id: signoff, description: `Replace the ${what} on ${routes.join(', ')} with real, permitted ones, or confirm to launch with them`, status: 'pending' }] : [];
  });
}
const isPlaceholderItem = (id) => PLACEHOLDER_BLOCKS.some((entry) => entry.signoff === id);

// The stated proof the built pages show: a group no page shows (Site Factory's own testimonials, cases or size facts
// took its place everywhere) is not listed for sign-off.
export function shownProof(proof, pages) {
  const blocks = pages.flatMap((page) => page.blocks ?? []);
  // A testimonials block of the page's own (placeholder) reviews is not the stated proof.
  const shows = (group) => blocks.some((block) => block.id === proofGroupBlockId(group) && (group !== 'testimonials' || block.items?.some((item) => !item.placeholder)));
  return Object.fromEntries(Object.entries(proof).map(([key, value]) => [key, PROOF_GROUPS.includes(key) && !shows(key) ? [] : value]));
}

export function mergeProofItems(signoff, proof, pages = []) {
  const wanted = [...proofSignoffItems(proof), ...placeholderItems(pages), reviewSignoffItem(pages)].filter(Boolean);
  const kept = signoff.items.filter((item) => !item.id.startsWith('proof-') && !isPlaceholderItem(item.id) && item.id !== REVIEW_SIGNOFF);
  const merged = wanted.map((item) => {
    const before = signoff.items.find((entry) => entry.id === item.id);
    return before && before.description === item.description ? before : item;
  });
  return { ...signoff, items: [...kept, ...merged] };
}

runMain(import.meta.url, async () => {
  const proof = await readJson(resolve('src/data/site-proof.json'));
  if (proof.schemaVersion !== PROOF_SCHEMA) throw new Error(`unsupported proof schema: ${proof.schemaVersion}`);
  const path = resolve('docs/research/release-signoff.json');
  const signoff = await readJson(path, { schemaVersion: SIGNOFF_SCHEMA, items: [] });
  const pages = [...await readJson(resolve('src/data/authoring-pages.json'), []), ...await readJson(resolve('src/data/placeholder-pages.json'), [])];
  const next = mergeProofItems(signoff, shownProof(proof, pages), pages);
  await writeJson(path, next);
  for (const item of next.items.filter((entry) => entry.id.startsWith('proof-') || isPlaceholderItem(entry.id))) console.log(`${item.status === 'confirmed' ? 'x' : ' '} ${item.id}`);
});
